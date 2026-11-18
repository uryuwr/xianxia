# glTF 动画逐通道比对：追加 / 改动画后确认旧片段没变（美术管线）。用法：python tools/glb_anim_diff.py 旧.glb 新.glb
import json, struct, sys
def load(p):
    b = open(p, 'rb').read()
    n = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + n])
    off = 20 + n
    bl = struct.unpack_from('<I', b, off)[0]
    return j, b[off + 8: off + 8 + bl]
def acc(j, bin_, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    comp = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
    s = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return struct.unpack_from('<%df' % (a['count'] * comp), bin_, s)
def anims(p):
    j, b = load(p); out = {}
    for an in j['animations']:
        d = {}
        for ch in an['channels']:
            node = j['nodes'][ch['target']['node']]['name']
            sm = an['samplers'][ch['sampler']]
            d[(node, ch['target']['path'])] = acc(j, b, sm['output'])
        out[an['name']] = d
    return out
A, B = anims(sys.argv[1]), anims(sys.argv[2])
print('old', sorted(A)); print('new', sorted(B))
for k in A:
    if k not in B: print('MISSING', k); continue
    mx = 0
    for ch, v in A[k].items():
        w = B[k].get(ch)
        if w is None or len(w) != len(v): print('DIFF len', k, ch); mx = 9; continue
        mx = max(mx, max(abs(x - y) for x, y in zip(v, w)))
    print('%-11s max abs diff %.2e' % (k, mx))
