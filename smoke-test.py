import json, urllib.request, time, sys

B = 'http://localhost:3312'
state = {'ck': None}


def req(path, method='GET', data=None):
    r = urllib.request.Request(B + path, method=method)
    if state['ck']:
        r.add_header('Cookie', state['ck'])
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        r.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(r, body, timeout=10) as resp:
            sc = resp.headers.get_all('Set-Cookie')
            if sc:
                state['ck'] = sc[0].split(';')[0]
            return resp.status, resp.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')


fails = []


def ok(cond, msg):
    print(('PASS' if cond else 'FAIL'), msg)
    if not cond:
        fails.append(msg)


time.sleep(1)

s, b = req('/api/admin/setup', 'POST', {'password': 'testpass123'})
ok(s == 200, 'first-run password setup')

s, b = req('/api/admin/login', 'POST', {'password': 'testpass123'})
ok(s == 200, 'login succeeds')

s, b = req('/api/admin/login', 'POST', {'password': 'wrongpass'})
ok(s == 401, 'wrong password rejected')

s, b = req('/api/admin/products', 'POST', {
    'title': 'Charcoal L-shaped sectional', 'code': 'SF-1001',
    'category': 'Sectional Couches', 'price': 480, 'quantity': 3,
    'condition': 'Like new', 'dimensions': '110in W x 68in D',
    'includes': '3-piece sectional, all cushions',
    'notIncluded': 'Ottoman not included',
})
pid = json.loads(b)['product']['id']
ok(s == 200 and json.loads(b)['product']['quantity'] == 3, 'create item with quantity=3')

s, b = req('/api/admin/products/%s/stock' % pid, 'POST', {'delta': -1, 'reason': 'sold / removed'})
p = json.loads(b)['product']
ok(p['quantity'] == 2 and p['status'] == 'available', 'decrement -> 2, still available')

s, b = req('/api/admin/products/%s/stock' % pid, 'POST', {'delta': -2})
p = json.loads(b)['product']
ok(p['quantity'] == 0 and p['status'] == 'sold' and bool(p['soldAt']),
   'hits 0 -> auto status sold + soldAt stamped')

s, b = req('/api/admin/products/%s/stock' % pid, 'POST', {'delta': 1})
p = json.loads(b)['product']
ok(p['quantity'] == 1 and p['status'] == 'available' and p['soldAt'] is None,
   'restock -> back to available, soldAt cleared')

s, b = req('/api/admin/log')
log = json.loads(b)['log']
ok(len(log) >= 4, 'stock log has %d entries' % len(log))
ok(log[0]['left'] == 1 and log[0]['change'] == 1, 'latest log entry left=1 change=+1')

s, b = req('/api/admin/stats')
st = json.loads(b)
ok(st['units'] == 1 and st['askingValue'] == 480, 'stats: 1 unit / $480 asking value')

s, b = req('/api/products')
pub = json.loads(b)['products']
ok(len(pub) == 1 and pub[0].get('isNew') is True, 'public list carries isNew flag')

# sold items drop off the public site after 7 days
s, b = req('/api/admin/products/%s' % pid, 'PUT', {'status': 'sold'})
old = json.loads(b)['product']['soldAt']
s, b = req('/api/admin/products/%s' % pid, 'PUT', {'soldAt': '2000-01-01T00:00:00.000Z'})
s, b = req('/api/products')
pub = json.loads(b)['products']
ok(len(pub) == 0, 'item sold >7 days ago is hidden from public list')

# restore for further checks
req('/api/admin/products/%s' % pid, 'PUT', {'status': 'available', 'soldAt': None})
s, b = req('/api/products')
ok(len(json.loads(b)['products']) == 1, 'restored item is public again')

# XSS payload must survive round-trip escaped by the client, but not execute here
s, b = req('/api/admin/products', 'POST', {
    'title': '<img src=x onerror=alert(1)>', 'code': 'XSS-1',
    'category': 'Other', 'price': 1, 'quantity': 1,
})
xid = json.loads(b)['product']['id']
s, b = req('/api/products')
titles = [p['title'] for p in json.loads(b)['products']]
ok('<img src=x onerror=alert(1)>' in titles, 'raw text stored as-is (escaped at render time)')

# backup round trip
s, b = req('/api/admin/backup')
backup = json.loads(b)
ok('products' in backup and backup['site']['admin'] is None, 'backup exports data, excludes password hash')

s, b = req('/api/admin/backup', 'POST', backup)
ok(s == 200, 'backup restore accepted')
s, b = req('/api/products')
ok(len(json.loads(b)['products']) == 2, 'restore brought back 2 items')

s, b = req('/listing/%s' % pid)
ok(s == 200 and 'Listing text' in b or 'Marketplace' in b, 'listing page route serves HTML')

# ---------- category manager ----------
# categories save with dedupe (case-insensitive) and order preserved
s, b = req('/api/admin/site', 'PUT', {'categories': ['TV Stand', 'tv stand', 'Sofas', ' Beds ']})
ok(s == 200, 'categories save accepted')
s, b = req('/api/site')
cats = json.loads(b)['categories']
ok(cats == ['TV Stand', 'Sofas', 'Beds'], 'categories deduped case-insensitively and trimmed: %s' % cats)
ok('rating' not in json.loads(b), 'rating field removed from public site payload')

# rename re-tags items when asked
s, b = req('/api/admin/products/%s' % pid, 'PUT', {'category': 'Sofas'})
ok(s == 200, 'item category set to Sofas')
s, b = req('/api/admin/categories/rename', 'POST', {'from': 'Sofas', 'to': 'Couches', 'updateItems': True})
r = json.loads(b)
ok(s == 200 and r.get('updated') == 1, 'rename with updateItems re-tagged 1 item')
s, b = req('/api/site')
ok(json.loads(b)['categories'] == ['TV Stand', 'Couches', 'Beds'], 'site categories renamed in place')
s, b = req('/api/products')
ok(any(p['category'] == 'Couches' for p in json.loads(b)['products']), 'item now uses the new category name')

# rename guards
s, b = req('/api/admin/categories/rename', 'POST', {'from': 'Couches', 'to': 'TV Stand'})
ok(s == 400, 'rename to an existing category rejected')
s, b = req('/api/admin/categories/rename', 'POST', {'from': 'Nope', 'to': 'Whatever'})
ok(s == 400, 'rename of unknown category rejected')
s, b = req('/api/admin/categories/rename', 'POST', {'from': 'couches', 'to': 'Sectionals'})
ok(s == 200, 'rename is case-insensitive on the from-name')

# leave the site categories at their defaults so other tests see a sane state
req('/api/admin/site', 'PUT', {'categories': ['Sectional Couches', 'Bed Frames', 'Home Furniture']})

print('PID=%s XID=%s' % (pid, xid))
print('FAILURES:', len(fails))
sys.exit(1 if fails else 0)