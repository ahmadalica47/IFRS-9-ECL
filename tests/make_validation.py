"""Builds the validation pack:
  test-data/validation-cases.csv   upload this into the calculator
  test-data/validation-workbook.xlsx  recalculates every case with plain Excel formulas, independent of the app
Usage: python tests/make_validation.py
"""
import os, zipfile, datetime
from xml.sax.saxutils import escape

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, 'test-data')

# (case, customer, invoice date, due date or '', amount, collateral, credit-impaired, what it tests)
CASES = [
    ('01', 'Case 01 Current', '2026-09-15', '2026-10-15', 100000, 0, 'No', 'Not yet due: Current band, Stage 1'),
    ('02', 'Case 02 Late 20 days', '2026-08-11', '2026-09-10', 80000, 0, 'No', '1-30 band, Stage 1'),
    ('03', 'Case 03 Late 45 days', '2026-07-17', '2026-08-16', 60000, 0, 'No', '31-60 band, Stage 2 (over 30 days, 5.5.11)'),
    ('04', 'Case 04 Late 80 days', '2026-06-12', '2026-07-12', 50000, 0, 'No', '61-90 band, Stage 2'),
    ('05', 'Case 05 Late 150 days', '2026-04-03', '2026-05-03', 40000, 0, 'No', '91-180 band, Stage 3 (over 90 days, B5.5.37)'),
    ('06', 'Case 06 Late 270 days', '2025-12-04', '2026-01-03', 30000, 0, 'No', '181-365 band'),
    ('07', 'Case 07 Late 486 days', '2025-05-02', '2025-06-01', 20000, 0, 'No', 'Over 365 band'),
    ('08', 'Case 08 Collateral', '2026-07-17', '2026-08-16', 90000, 40000, 'No', 'Collateral deducted: exposure 50,000'),
    ('09', 'Case 09 Credit impaired', '2026-05-23', '2026-06-22', 70000, 0, 'Yes', 'Flagged credit-impaired: PD 100%'),
    ('10', 'Case 10 No due date', '2026-08-01', '', 25000, 0, 'No', 'No due date: invoice date + 30 days terms'),
    ('11', 'Case 11 Credit note', '2026-09-01', '2026-10-01', -5000, 0, 'No', 'Negative amount: no loss'),
    ('12', 'Case 12 After reporting date', '2026-10-05', '2026-11-04', 45000, 0, 'No', 'Dated after reporting date: left out'),
]
BANDS = [('Current', -99999, 0, 0.01), ('1-30 days', 1, 30, 0.03), ('31-60 days', 31, 60, 0.08), ('61-90 days', 61, 90, 0.15),
         ('91-180 days', 91, 180, 0.35), ('181-365 days', 181, 365, 0.6), ('Over 365 days', 366, 99999, 0.9)]

# ---------- CSV to upload ----------
with open(os.path.join(out, 'validation-cases.csv'), 'w', encoding='utf-8', newline='') as f:
    f.write('Customer name,Invoice no,Invoice date,Due date,Outstanding amount,Collateral,Credit impaired\r\n')
    for c in CASES: f.write(f'{c[1]},VAL-{c[0]},{c[2]},{c[3]},{c[4]},{c[5]},{c[6]}\r\n')

# ---------- workbook with formulas ----------
serial = lambda iso: (datetime.date.fromisoformat(iso) - datetime.date(1899, 12, 30)).days
def col(i):
    s = ''; i += 1
    while i: i, r = divmod(i - 1, 26); s = chr(65 + r) + s
    return s
cells = {}  # (row, col) -> xml
def put(r, c, v, style=0):
    ref = f'{col(c)}{r}'; st = f' s="{style}"' if style else ''
    if v is None or v == '': cells[(r, c)] = f'<c r="{ref}"{st}/>'
    elif isinstance(v, str) and v.startswith('='): cells[(r, c)] = f'<c r="{ref}"{st}><f>{escape(v[1:])}</f></c>'
    elif isinstance(v, (int, float)): cells[(r, c)] = f'<c r="{ref}"{st}><v>{v}</v></c>'
    else: cells[(r, c)] = f'<c r="{ref}" t="inlineStr"{st}><is><t xml:space="preserve">{escape(str(v))}</t></is></c>'
# styles: 1 bold, 2 date, 3 #,##0.00, 4 0.00%, 5 input (yellow) number, 6 input date, 7 input percent, 8 title, 9 header, 10 0.000000
B, DATE, NUM, PCT, IN, IND, INP, TITLE, HEAD, X6 = 1, 2, 3, 4, 5, 6, 7, 8, 9, 10

put(1, 0, 'IFRS 9 ECL calculator - independent validation (simplified approach, trade receivables)', TITLE)
put(2, 0, 'Yellow cells are inputs. Copy them from the app (Excel report > Assumptions sheet). Every other figure is a plain Excel formula.')
inputs = [('Reporting date', serial('2026-09-30'), IND), ('Payment terms if no due date (days)', 30, IN), ('Loss given default (LGD)', 0.45, INP),
          ('Effective interest rate', 0.05, INP), ('Months to collection', 3, IN)]
for i, (k, v, st) in enumerate(inputs): put(4 + i, 0, k); put(4 + i, 1, v, st)
put(9, 0, 'Discount factor = (1+EIR)^(-months/12)'); put(9, 1, '=(1+B7)^(-B8/12)', X6)
put(11, 0, 'Scenario', HEAD); put(11, 1, 'PD multiplier', HEAD); put(11, 2, 'Weight', HEAD)
for i, (k, m, w) in enumerate([('Normal (Base)', 1, 0.5), ('Better (Upside)', 1, 0.2), ('Worse (Downside)', 1, 0.3)]):
    put(12 + i, 0, k); put(12 + i, 1, m, IN); put(12 + i, 2, w, INP)
put(15, 0, 'Multiplier 1 = economy at its normal range. With a country selected, copy the three "PD multiplier" values from the Assumptions sheet of the app\'s Excel report.')
put(3, 4, 'Age band', HEAD); put(3, 5, 'From (days past due)', HEAD); put(3, 6, 'To', HEAD); put(3, 7, 'Rate (PD)', HEAD)
for i, (lb, fr, to, pd) in enumerate(BANDS): put(4 + i, 4, lb); put(4 + i, 5, fr, IN); put(4 + i, 6, to, IN); put(4 + i, 7, pd, INP)
BF, BL, BR = '$F$4:$F$10', '$E$4:$E$10', '$H$4:$H$10'

H = 17
heads = ['Case', 'Customer', 'Invoice date', 'Due date', 'Amount', 'Collateral', 'Credit-impaired', 'Due date used', 'Included?', 'Days past due',
         'Age band', 'Band rate', 'Stage', 'Exposure', 'ECL normal', 'ECL better', 'ECL worse', 'Expected ECL', 'App result (paste)', 'Difference', 'Check', 'What it tests']
for j, h in enumerate(heads): put(H, j, h, HEAD)
first = H + 1
for i, c in enumerate(CASES):
    r = first + i
    put(r, 0, c[0]); put(r, 1, c[1]); put(r, 2, serial(c[2]), DATE); put(r, 3, serial(c[3]) if c[3] else '', DATE); put(r, 4, c[4], NUM); put(r, 5, c[5], NUM); put(r, 6, c[6])
    put(r, 7, f'=IF(D{r}="",C{r}+$B$5,D{r})', DATE)
    put(r, 8, f'=IF(C{r}>$B$4,"No","Yes")')
    put(r, 9, f'=$B$4-H{r}')
    put(r, 10, f'=LOOKUP(J{r},{BF},{BL})')
    put(r, 11, f'=LOOKUP(J{r},{BF},{BR})', PCT)
    put(r, 12, f'=IF(I{r}="No","",IF(OR(G{r}="Yes",J{r}>90),3,IF(J{r}>30,2,1)))')
    put(r, 13, f'=MAX(E{r}-F{r},0)', NUM)
    for k, (cc, mref) in enumerate([(14, '$B$12'), (15, '$B$13'), (16, '$B$14')]):
        put(r, cc, f'=IF(I{r}="No",0,N{r}*IF(G{r}="Yes",1,MIN(1,L{r}*{mref}))*$B$6*$B$9)', NUM)
    put(r, 17, f'=(O{r}*$C$12+P{r}*$C$13+Q{r}*$C$14)/($C$12+$C$13+$C$14)', NUM)
    put(r, 18, '', IN)
    put(r, 19, f'=IF(S{r}="","",S{r}-R{r})', NUM)
    put(r, 20, f'=IF(S{r}="","",IF(ABS(T{r})<0.5,"OK","CHECK"))')
    put(r, 21, c[7])
last = first + len(CASES) - 1; t = last + 1
put(t, 1, 'Total', B); put(t, 4, f'=SUMIF(I{first}:I{last},"Yes",E{first}:E{last})', NUM); put(t, 13, f'=SUM(N{first}:N{last})', NUM)
for cc in (14, 15, 16, 17, 18): put(t, cc, f'=SUM({col(cc)}{first}:{col(cc)}{last})', NUM)
put(t, 19, f'=IF(S{t}=0,"",S{t}-R{t})', NUM); put(t, 20, f'=IF(S{t}=0,"",IF(ABS(T{t})<1,"OK","CHECK"))', B)
put(t + 2, 0, 'Notes', B)
notes = ['Gross amount owed (total of Amount, included rows only) should equal "Gross amount owed" in the app.',
         'Expected ECL total should equal the loss allowance in the app. Per row, compare with the "ECL weighted" column of the Invoices sheet in the app\'s Excel report.',
         'Case 12 is dated after the reporting date, so the app leaves it out. It is not in the app\'s Invoices sheet, so paste the other 11 rows in order.',
         'Stage: 1 = up to 30 days past due, 2 = 31-90 days, 3 = over 90 days or credit-impaired (IFRS 9 5.5.11, B5.5.37). Under the simplified approach the stage does not change the amount.',
         'Credit-impaired rows use a 100% chance of default, so the economy does not change them.']
for i, n in enumerate(notes): put(t + 3 + i, 0, n)

rows = {}
for (r, c), x in cells.items(): rows.setdefault(r, []).append((c, x))
sheet = ''.join(f'<row r="{r}">' + ''.join(x for _, x in sorted(v)) + '</row>' for r, v in sorted(rows.items()))
widths = [10, 28, 13, 13, 13, 12, 14, 14, 10, 13, 15, 10, 8, 13, 13, 13, 13, 14, 16, 12, 9, 46]
cols = ''.join(f'<col min="{i+1}" max="{i+1}" width="{w}" customWidth="1"/>' for i, w in enumerate(widths))
ws = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      f'<sheetViews><sheetView workbookViewId="0"><pane ySplit="{H}" topLeftCell="A{H+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      f'<cols>{cols}</cols><sheetData>{sheet}</sheetData></worksheet>')
styles = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
          '<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/><numFmt numFmtId="166" formatCode="0.000000"/></numFmts>'
          '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
          '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
          '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>'
          '<fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills>'
          '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
          '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
          '<cellXfs count="11"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
          '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
          '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
          '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
          '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
          '<xf numFmtId="164" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>'
          '<xf numFmtId="165" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>'
          '<xf numFmtId="10" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>'
          '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
          '<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
          '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
          '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>')
files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Validation" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': styles,
    'xl/worksheets/sheet1.xml': ws,
}
with zipfile.ZipFile(os.path.join(out, 'validation-workbook.xlsx'), 'w', zipfile.ZIP_DEFLATED) as z:
    for k, v in files.items(): z.writestr(k, v)
print('Wrote test-data/validation-cases.csv and test-data/validation-workbook.xlsx')
