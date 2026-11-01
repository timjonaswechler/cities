"""Local native CLI proof, no network/CI and no generated expected answers."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

proof = Path(__file__).parent
city, zoo = sys.argv[1:]
config = 'assets/building-types/purplechurch.json'
def run(*args, ok=True):
    result = subprocess.run(args, capture_output=True, text=True)
    if (result.returncode == 0) != ok:
        raise AssertionError((args, result.returncode, result.stdout, result.stderr))
    return result

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

checks = []
baseline = json.loads((proof / 'original-baseline.json').read_text())['city']
for seed in (7, 91):
    data = json.loads((proof / f'city-{seed}.json').read_text())
    assert data['format'] == 'building-types-city-prototype'
    assert data['originalCity'] == baseline
    assert 'economy' not in data and 'city' not in data
    assert len(data['placements']) == 3
    assert data['placements'][2]['design'] is None
    for i, placement in enumerate(data['placements'][:2]):
        assert placement['design'] is not None
        request = proof / f'request-{seed}-{i}.json'
        request.write_text(json.dumps(placement['request'], indent=2) + '\n')
        out = proof / f'zoo-{seed}-{i}.json'
        run(zoo, '--request', str(request), '--geometry-only', '--export', str(out))
        z = json.loads(out.read_text())
        assert z['result']['Ok'] == placement['design']
        assert z['meshes'] == placement['meshes']
        checks.append(f'seed {seed} candidate {i}: exact Zoo/City design AND mesh equality')

hashes = json.loads((proof / 'baseline-export-hashes.json').read_text())
with tempfile.TemporaryDirectory(prefix='city-step3-proof-') as tmp:
    for name, flags in [
        ('original', []), ('snapshot', ['--snapshot']),
        ('market', ['--market-profile', 'assets/market-profiles/market-v1.json']),
        ('v1', ['--building-profile', 'assets/building-profiles/buildings-v1.json']),
        ('v2', ['--buildings']),
    ]:
        path = str(Path(tmp) / f'{name}.json')
        if name == 'snapshot':
            run(city, '--seed', '42', '--size', '25', '--snapshot', path)
        else:
            run(city, '--seed', '42', '--size', '25', *flags, '--export', path)
        assert digest(json.loads(Path(path).read_text())) == hashes[name], name
        checks.append(f'{name}: complete canonical JSON matches pre-edit baseline')
    for flags in [ ['--economy'], ['--buildings'],
                   ['--building-profile', 'assets/building-profiles/buildings-v1.json'],
                   ['--market-profile', 'assets/market-profiles/market-v1.json'],
                   ['--snapshot', str(Path(tmp) / 'forbidden.json')] ]:
        result = run(city, '--building-types', config, *flags, '--export', str(Path(tmp) / 'out.json'), ok=False)
        assert 'incompatible' in result.stderr
        checks.append(f'CLI rejects unsupported combination {flags[0]}')

# Keep complete machine evidence without hundreds of thousands of pretty-print
# diff lines. Numeric values and JSON data are unchanged.
for artifact in proof.glob('*.json'):
    artifact.write_text(json.dumps(json.loads(artifact.read_text()), separators=(',', ':')) + '\n')

(proof / 'machine-checks.txt').write_text('\n'.join(checks) + '\n')
print('\n'.join(checks))
