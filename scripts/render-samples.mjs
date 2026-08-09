// Renders the synthetic mail set to public/samples/*.png using headless Chrome.
// All mail pieces are fictional. Run: npm run render:samples
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = new URL("../public/samples/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const page = (body, extra = "") => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; background:#e8e6e1; display:flex; align-items:center; justify-content:center; width:900px; height:700px; }
  .paper { background:#fdfdfb; box-shadow:0 1px 6px rgba(0,0,0,.25); position:relative; }
  ${extra}
</style></head><body>${body}</body></html>`;

const check = (name, payee, amountNum, amountWords, date, memo, font, bank, num) => page(`
<div class="paper" style="width:780px;height:330px;padding:28px 36px;">
  <div style="display:flex;justify-content:space-between;">
    <div><b style="font-size:17px;">${name}</b><br><span style="font-size:12px;color:#444;">88 Prospect Park West<br>Brooklyn, NY 11215</span></div>
    <div style="text-align:right;font-size:13px;">${bank}<br><span style="font-size:12px;">No. ${num}</span></div>
  </div>
  <div style="margin-top:26px;display:flex;justify-content:flex-end;align-items:baseline;gap:8px;">
    <span style="font-size:12px;">DATE</span><span style="border-bottom:1px solid #333;padding:0 14px;font-family:${font};font-size:16px;">${date}</span>
  </div>
  <div style="margin-top:14px;display:flex;align-items:baseline;gap:8px;">
    <span style="font-size:12px;">PAY TO THE<br>ORDER OF</span>
    <span style="flex:1;border-bottom:1px solid #333;padding:0 8px;font-family:${font};font-size:19px;">${payee}</span>
    <span style="border:1.5px solid #333;padding:4px 10px;font-family:${font};font-size:18px;">\$${amountNum}</span>
  </div>
  <div style="margin-top:16px;display:flex;align-items:baseline;gap:8px;">
    <span style="flex:1;border-bottom:1px solid #333;padding:0 8px;font-family:${font};font-size:15px;">${amountWords}</span>
    <span style="font-size:12px;">DOLLARS</span>
  </div>
  <div style="margin-top:22px;display:flex;justify-content:space-between;align-items:baseline;">
    <span style="font-size:12px;">MEMO <span style="border-bottom:1px solid #333;padding:0 10px;font-family:${font};font-size:14px;">${memo}</span></span>
    <span style="border-bottom:1px solid #333;padding:0 30px;font-family:${font};font-size:20px;">${name.split(" ")[0]} ${name.split(" ").slice(-1)}</span>
  </div>
  <div style="margin-top:18px;font-family:monospace;font-size:15px;letter-spacing:2px;">⑆021000021⑆ 4471 8829 03⑈ ${num}</div>
</div>`);

const letter = (logo, sender, addr, title, bodyHtml, footer = "") => page(`
<div class="paper" style="width:640px;height:640px;padding:44px 52px;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <div style="font-size:20px;font-weight:700;">${logo}</div>
    <div style="font-size:11px;color:#555;text-align:right;">${addr}</div>
  </div>
  <div style="margin-top:26px;font-size:11px;color:#333;">TO: Cherry Street Labs LLC<br>ATTN: Michael Battaglia<br>447 Broadway, 2nd Fl, New York, NY 10013</div>
  <h1 style="margin-top:22px;font-size:17px;">${title}</h1>
  <div style="margin-top:12px;font-size:12.5px;line-height:1.55;color:#222;">${bodyHtml}</div>
  <div style="position:absolute;bottom:30px;left:52px;right:52px;font-size:10px;color:#777;">${footer} — ${sender}</div>
</div>`);

const samples = {
  "check-business": check("Meridian Property Group", "Cherry Street Labs LLC", "2,450.00", "Two thousand four hundred fifty and 00/100", "08/02/2026", "Aug consulting", "Georgia", "First National Bank", "1084"),
  "check-handwritten": check("R. Delgado", "cherry st labs", "875.50", "eight hundred seventy five &amp; 50/100", "8/1/26", "inv 2219", "'Bradley Hand','Comic Sans MS',cursive", "Coastal Credit Union", "0412"),
  "irs-notice": letter("IRS", "Department of the Treasury<br>Internal Revenue Service<br>Ogden, UT 84201", "Notice CP161 — Balance Due: \$1,742.00",
    `<p>Our records show your Form 1120 for tax year 2025 has an unpaid balance of <b>\$1,742.00</b>, including penalties and interest.</p>
     <p style="margin-top:10px;"><b>Pay by September 15, 2026</b> to avoid additional interest charges. Payment options are available at irs.gov/payments.</p>
     <p style="margin-top:10px;">If you disagree with this notice, call the number above within 30 days of the notice date.</p>`,
    "Notice date: August 4, 2026"),
  "legal-service": letter("SUPERIOR COURT", "Superior Court of California<br>County of San Francisco<br>400 McAllister St", "SUMMONS — Civil Case No. CGC-26-618442",
    `<p><b>NOTICE TO DEFENDANT: Cherry Street Labs LLC</b></p>
     <p style="margin-top:10px;">You are being sued by plaintiff Hartwell Logistics Inc. You have <b>30 calendar days</b> after this summons is served to file a written response with this court.</p>
     <p style="margin-top:10px;">If you do not respond on time, you may lose the case by default, and your wages, money, and property may be taken without further warning.</p>`,
    "Service via registered agent — August 6, 2026"),
  "de-franchise": letter("DELAWARE", "State of Delaware<br>Division of Corporations<br>Dover, DE 19901", "Annual Franchise Tax Notice — Due March 1, 2027",
    `<p>File number: 7218840. Your Delaware corporation's annual report and franchise tax payment of <b>\$400.00</b> (minimum) are due <b>March 1, 2027</b>.</p>
     <p style="margin-top:10px;">Failure to file will result in a \$200 penalty plus 1.5% monthly interest and loss of good standing.</p>`,
    "Mailed August 1, 2026"),
  "invoice": letter("APEX PRINTING CO.", "Apex Printing Co.<br>1400 Industrial Ave<br>Long Island City, NY 11101", "Invoice #4471 — \$1,180.00 — Net 30",
    `<table style="width:100%;font-size:12px;border-collapse:collapse;">
      <tr style="border-bottom:1px solid #ccc;text-align:left;"><th style="padding:6px 0;">Item</th><th>Qty</th><th style="text-align:right;">Amount</th></tr>
      <tr><td style="padding:6px 0;">Letterpress business cards</td><td>2,500</td><td style="text-align:right;">\$680.00</td></tr>
      <tr><td style="padding:6px 0;">Branded envelopes</td><td>1,000</td><td style="text-align:right;">\$500.00</td></tr>
      <tr style="border-top:1px solid #333;font-weight:700;"><td style="padding:8px 0;">Total due September 3, 2026</td><td></td><td style="text-align:right;">\$1,180.00</td></tr>
     </table>
     <p style="margin-top:12px;">Remit to the address above or pay online. Thank you for your business.</p>`,
    "Invoice date: August 4, 2026"),
  "bank-statement": letter("FIRST NATIONAL", "First National Bank<br>Business Banking<br>PO Box 5501, NY 10087", "Business Checking Statement — July 2026",
    `<table style="width:100%;font-size:12px;border-collapse:collapse;">
      <tr><td style="padding:4px 0;">Beginning balance (Jul 1)</td><td style="text-align:right;">\$18,204.11</td></tr>
      <tr><td style="padding:4px 0;">Deposits &amp; credits (14)</td><td style="text-align:right;">\$22,860.40</td></tr>
      <tr><td style="padding:4px 0;">Withdrawals &amp; debits (31)</td><td style="text-align:right;">\$19,442.87</td></tr>
      <tr style="border-top:1px solid #333;font-weight:700;"><td style="padding:6px 0;">Ending balance (Jul 31)</td><td style="text-align:right;">\$21,621.64</td></tr>
     </table>
     <p style="margin-top:12px;">Account ****8829 · Statement period Jul 1 – Jul 31, 2026 · Page 1 of 4</p>`,
    "Member FDIC"),
  "utility-bill": letter("CON EDISON", "Con Edison<br>PO Box 1701<br>New York, NY 10116", "Energy Bill — \$342.18 due August 28, 2026",
    `<p>Service address: 447 Broadway, 2nd Fl, New York, NY.</p>
     <p style="margin-top:10px;">Electricity usage for July 2026: 2,140 kWh. Total amount due: <b>\$342.18</b> by <b>August 28, 2026</b>.</p>
     <p style="margin-top:10px;">Enroll in AutoPay at coned.com to never miss a due date.</p>`,
    "Account 44-2210-8876-0002"),
  "junk-credit": letter("PLATINUM REWARDS", "Summit Card Services<br>PO Box 90210<br>Wilmington, DE 19850", "You're pre-approved: 0% APR for 18 months",
    `<p style="font-size:15px;color:#b03;"><b>Congratulations!</b> Cherry Street Labs LLC has been pre-selected for the Summit Platinum Business Card.</p>
     <p style="margin-top:10px;">Earn 80,000 bonus points when you spend \$6,000 in the first 3 months. No annual fee the first year.</p>
     <p style="margin-top:10px;"><b>Respond by August 31, 2026.</b> This exclusive offer won't last.</p>`,
    "Pre-screened offer. See enclosed terms."),
  "junk-pizza": page(`
<div class="paper" style="width:640px;height:480px;padding:36px;font-family:'Arial Black',Arial,sans-serif;background:#fff8ee;">
  <div style="font-size:42px;color:#d1341f;font-weight:900;">TONY'S SLICE HOUSE</div>
  <div style="font-size:20px;margin-top:8px;color:#333;">GRAND RE-OPENING · PARK SLOPE</div>
  <div style="margin-top:24px;display:flex;gap:18px;">
    <div style="border:3px dashed #d1341f;padding:18px;flex:1;text-align:center;"><div style="font-size:34px;color:#d1341f;">2 FOR 1</div><div style="font-size:14px;margin-top:6px;">Large pies, Mon–Wed</div></div>
    <div style="border:3px dashed #d1341f;padding:18px;flex:1;text-align:center;"><div style="font-size:34px;color:#d1341f;">\$5 OFF</div><div style="font-size:14px;margin-top:6px;">Orders over \$30</div></div>
  </div>
  <div style="margin-top:22px;font-family:Arial;font-size:13px;color:#555;">Expires 9/30/26 · 5th Ave &amp; Union St · Resident at 88 Prospect Park West</div>
</div>`),
};

const tmp = join(tmpdir(), "mailroom-samples");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

for (const [id, html] of Object.entries(samples)) {
  const f = join(tmp, `${id}.html`);
  writeFileSync(f, html);
  execSync(
    `"${CHROME}" --headless --disable-gpu --screenshot="${OUT}${id}.png" --window-size=900,700 --hide-scrollbars "file://${f}"`,
    { stdio: "pipe" }
  );
  console.log("rendered", id);
}
console.log("done:", Object.keys(samples).length, "samples ->", OUT);
