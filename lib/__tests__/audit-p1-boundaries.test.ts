import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import gates from "../../docs/audits/phase1-action-gates.json";
const read = (p: string) => readFileSync(p, "utf8");
describe("audit Phase 1 boundaries", () => {
  for (const [path, [guard, ...names]] of Object.entries(gates)) {
    it(`${path}: each listed mutation checks a role before database work`, () => {
      const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
      for (const name of names) {
        const fn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name) as ts.FunctionDeclaration;
        expect(fn?.body, name).toBeDefined();
        const body = fn.body!.getText(source);
        expect(body.indexOf(`await ${guard}(`), name).toBeGreaterThanOrEqual(0);
        const firstClient = body.search(/(?:createSupabaseAdmin|createSupabaseServerClient)\(/);
        if (firstClient >= 0) expect(body.indexOf(`await ${guard}(`), name).toBeLessThan(firstClient);
      }
    });
  }
  it("internal delivery and automation helpers are not server-action endpoints", () => {
    for (const file of ["lib/launch/email.ts", "lib/launch/notifications.ts", "lib/crm/task-automation.ts", "lib/referrals/internal.ts", "lib/referrals/discount-internal.ts", "lib/rerostering/internal.ts", "lib/push/internal.ts", "lib/sms/internal.ts", "lib/feedback/request.ts"]) {
      expect(read(file)).toContain('import "server-only"');
      expect(read(file)).not.toContain('"use server"');
    }
  });
  it("every cron route uses the fail-closed shared authenticator", () => {
    for (const dir of readdirSync("app/api/cron")) {
      const source = read(`app/api/cron/${dir}/route.ts`);
      expect(source).toContain("requireCronAuth(");
      expect(source).not.toContain("process.env.CRON_SECRET");
    }
    for (const route of ["forecasts/generate", "health-scores/calculate", "crm/sequences/process", "public/refresh-stats"]) {
      expect(read(`app/api/${route}/route.ts`)).toContain("requireCronAuth(");
    }
  });
  it("both privileged page trees have authoritative server layouts", () => {
    for (const role of ["admin", "ops"]) expect(read(`app/(dashboard)/${role}/layout.tsx`)).toContain('redirect("/login")');
  });
});
