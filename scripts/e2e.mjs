// Clicks through a full demo-mode interview on an iPhone-sized viewport,
// using a fake microphone. Usage: node scripts/e2e.mjs <url> <screenshot-dir>
import { chromium } from "playwright-core";

const [url = "http://localhost:5173/", shots = "."] = process.argv.slice(2);
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  permissions: ["microphone"],
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const shot = (name) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
const answer = async () => {
  await page.getByRole("button", { name: "Start answering" }).click();
  await page.waitForTimeout(2200); // must be > 1.5 s minimum answer length
  await page.getByRole("button", { name: "Stop and send answer" }).click();
};

await page.goto(url);
await shot("1-home");
await page.getByRole("button", { name: "Start a mock interview" }).click();
await page.getByRole("radio", { name: /^3/ }).click();
await shot("2-setup");
await page.getByRole("button", { name: "Start interview" }).click();

// Q1 spoken
await page.getByRole("button", { name: "Start answering" }).waitFor({ timeout: 20000 });
await page.waitForFunction(() => !document.querySelector(".mic")?.disabled, null, { timeout: 30000 });
await answer();
await page.getByText("Follow-up").waitFor({ timeout: 30000 });
await page.waitForFunction(() => !document.querySelector(".mic")?.disabled, null, { timeout: 30000 });
await shot("3-interview-followup");

// Follow-up: typed
await page.getByRole("button", { name: "Type instead" }).click();
await page.getByPlaceholder("Type your answer…").fill("I compared the time our team logged for manual testing before and after the scripts, over two releases.");
await page.getByRole("button", { name: "Send" }).click();
await page.getByRole("button", { name: "Use voice" }).click();

// Q2, Q3 spoken
for (let i = 0; i < 2; i++) {
  await page.waitForFunction(() => document.querySelector(".mic") && !document.querySelector(".mic").disabled, null, { timeout: 30000 });
  await answer();
}
await page.locator(".ring").waitFor({ timeout: 60000 });
await page.waitForTimeout(900);
await shot("4-report");
await page.getByRole("button", { name: "‹ Home" }).click();
await shot("5-home-history");

// Dark mode check
await page.emulateMedia({ colorScheme: "dark" });
await shot("6-home-dark");

console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "No page errors");
await browser.close();
