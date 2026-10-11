"""Extrae el Banco Tanner y el Banco Baby de sus .docx a JSON, sin reescribir texto.

Uso: python3 -I extraer_bancos.py banco_tanner.docx banco_baby.docx salida_dir
Cada tarea es una celda de tabla con párrafos "ETIQUETA  texto".
"""
import sys, json, re, zipfile, xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
CAMPOS = {'BUSCAMOS': 'buscamos', 'MONTAJE': 'montaje', 'JUEGA': 'juega', 'DILE': 'dile', 'OBSERVA': 'observa',
          'MÁS FÁCIL': 'mas_facil', 'MÁS DIFÍCIL': 'mas_dificil', 'ESPACIO': 'espacio', 'ADAPTA': 'adapta', 'VIDEO': 'video'}
NIVELES = {'Sin rival': 'sin_rival', 'Con rival': 'con_rival', 'Con decisión': 'con_decision', 'En juego': 'en_juego'}
RETOS = {'BALÓN': 'balon', '1V1': '1v1', 'JUGAR JUNTOS': 'jugar_juntos', 'CANCHA': 'cancha', 'VENTAJA': 'ventaja',
         'AVANZAR': 'avanzar', 'GOL': 'gol', 'DEFENDER': 'defender', 'REACCIONAR': 'reaccionar'}
MUNDOS = {'MOVIMIENTO': 'movimiento', 'BALÓN': 'balon', 'JUEGO': 'juego', 'CONVIVENCIA': 'convivencia'}


def texto(p):
    return ''.join(t.text or '' for t in p.iter(W + 't')).strip()


def celdas(path):
    body = ET.fromstring(zipfile.ZipFile(path).read('word/document.xml')).find(W + 'body')
    for tbl in body.iter(W + 'tbl'):
        for tc in tbl.iter(W + 'tc'):
            ps = [texto(p) for p in tc.iter(W + 'p')]
            ps = [p for p in ps if p]
            if any(p.startswith('BUSCAMOS') for p in ps):
                yield ps


def frases(s):
    # DILE trae una o varias frases entre comillas tipográficas.
    q = re.findall(r'[“"]([^”"]+)[”"]', s)
    return q if q else [s]


def tarea(ps, kind):
    t = {'campos': {}}
    i = 0
    if kind == 'tanner':
        m = re.match(r'^(\d{2})\s+(.+)$', ps[0]); t['codigo'] = m.group(1); t['nombre'] = m.group(2).strip()
    else:
        t['nombre'] = ps[0].strip()
    eje, extra = [x.strip() for x in ps[1].split('·', 1)]
    if kind == 'tanner':
        t['reto'] = RETOS[eje]; t['nivel'] = NIVELES[extra]
    else:
        t['mundo'] = MUNDOS[eje]
        a, b = re.match(r'(\d)-(\d) años', extra).groups(); t['edad_min'] = int(a); t['edad_max'] = int(b)
    actual = None
    for p in ps[2:]:
        for etiqueta, clave in CAMPOS.items():
            if p.startswith(etiqueta + ' ') or p.startswith(etiqueta + ' ') or p == etiqueta:
                actual = clave; t['campos'][clave] = p[len(etiqueta):].strip(); break
        else:
            t['campos'][actual] += ' ' + p  # continuación (p. ej. la segunda frase de DILE)
    c = t.pop('campos')
    t.update({k: c.get(k) for k in CAMPOS.values()})
    t['dile'] = frases(t['dile']) if t['dile'] else []
    return t


def main(tanner, baby, out):
    bt = [tarea(ps, 'tanner') for ps in celdas(tanner)]
    bb = [tarea(ps, 'baby') for ps in celdas(baby)]
    for i, t in enumerate(bb, 1):
        t['codigo'] = f'B{i:02d}'
    json.dump({'banco': 'tanner', 'version': '1.0', 'tareas': bt}, open(out + '/banco-tanner-v1.0.json', 'w'), ensure_ascii=False, indent=1)
    json.dump({'banco': 'baby', 'version': '1.0', 'tareas': bb}, open(out + '/banco-baby-v1.0.json', 'w'), ensure_ascii=False, indent=1)
    print(len(bt), len(bb))


main(*sys.argv[1:4])
