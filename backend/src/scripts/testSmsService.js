import "dotenv/config";
import assert from "node:assert/strict";
import {
  normalizePhoneNumber,
  compactSmsText,
  checkRateLimit,
  buildSmsTemplate,
  sendSmsNotification,
  getSmsStatus,
} from "../services/smsService.js";

console.log("=========================================");
console.log("🧪 TESTING TEXTBEE SMS SERVICE & RATE LIMITER");
console.log("=========================================\n");

// ── Test 1: Phone Number Normalization ─────────────────────────────────────────
console.log("1. Testing Phone Number Normalization...");
assert.equal(normalizePhoneNumber("09171234567"), "+639171234567", "09XXXXXXXXX should normalize to +639XXXXXXXXX");
assert.equal(normalizePhoneNumber("9171234567"), "+639171234567", "9XXXXXXXXX should normalize to +639XXXXXXXXX");
assert.equal(normalizePhoneNumber("639171234567"), "+639171234567", "639XXXXXXXXX should normalize to +639XXXXXXXXX");
assert.equal(normalizePhoneNumber("+639171234567"), "+639171234567", "+639XXXXXXXXX should remain +639XXXXXXXXX");
assert.equal(normalizePhoneNumber("(0917) 123-4567"), "+639171234567", "Formatted numbers with parens/dashes should normalize");
assert.equal(normalizePhoneNumber("12345"), null, "Short invalid numbers should return null");
assert.equal(normalizePhoneNumber(""), null, "Empty phone string should return null");
assert.equal(normalizePhoneNumber(null), null, "Null phone should return null");
console.log("✓ All phone normalization assertions passed.\n");

// ── Test 2: SMS Text Compaction & Single Segment Limit (<= 160 chars) ──────────
console.log("2. Testing SMS Text Compaction & Character Bounds...");
const textWithEmoji = "Magandang araw po! 🎉 Ang inyong permit ay aprobado na! ✅ Salamat po! 🏛️";
const compacted = compactSmsText(textWithEmoji);
assert(!compacted.includes("🎉"), "Emojis must be stripped to prevent UCS-2 70-char SMS splitting");
assert(!compacted.includes("✅"), "Checkmark emojis must be stripped");

const superLongText = "A".repeat(300);
const capped = compactSmsText(superLongText);
assert(capped.length <= 160, `Length must not exceed 160 chars. Got: ${capped.length}`);
assert(capped.endsWith("..."), "Over-length messages should end with truncation ellipsis");
console.log(`✓ Compaction verified: Original 300 chars compacted to ${capped.length} chars (<=160 chars).\n`);

// ── Test 3: Template Generation ───────────────────────────────────────────────
console.log("3. Testing SMS Template Generation...");
const templates = [
  buildSmsTemplate("STATUS_OCULAR", { trackingNumber: "LUIS-ZC-2026-0001" }),
  buildSmsTemplate("STATUS_FOR_PAYMENT", { trackingNumber: "LUIS-ZC-2026-0001", orderOfPaymentNo: "OP-9988", amount: 280 }),
  buildSmsTemplate("STATUS_APPROVED", { trackingNumber: "LUIS-ZC-2026-0001" }),
  buildSmsTemplate("STATUS_RETURNED", { trackingNumber: "LUIS-ZC-2026-0001", reason: "Malabong kopya ng TCT" }),
  buildSmsTemplate("STATUS_DENIED", { trackingNumber: "LUIS-ZC-2026-0001" }),
  buildSmsTemplate("OFFICIAL_NOTE", { trackingNumber: "LUIS-ZC-2026-0001", note: "Paki-upload ang tax dec.", fromOffice: "MPDC" }),
  buildSmsTemplate("INSPECTION_UPDATE", { trackingNumber: "LUIS-ZC-2026-0001", stage: "Excavation", progress: 45 }),
  buildSmsTemplate("NEW_APPLICATION", { trackingNumber: "LUIS-ZC-2026-0001" }),
];

for (const tmpl of templates) {
  assert(tmpl.length > 0 && tmpl.length <= 160, `Template must be 1-160 characters: "${tmpl}" (${tmpl.length} chars)`);
  assert(tmpl.includes("LUIS-ZC-2026-0001"), "Template must include tracking number reference");
}
console.log("✓ All 8 standard workflow templates fit safely within the 160 GSM character boundary.\n");

// ── Test 4: Rate Limiting & Cooldown Protection (Dry-Run Safe Mode) ─────────
console.log("4. Testing Rate Limiting & Recipient Cooldown...");
const realApiKey = process.env.TEXTBEE_API_KEY;
process.env.TEXTBEE_API_KEY = ""; // Use simulation mode for unit tests to save SIM credits

const testPhone = "+639991112233";

// First check should pass
const check1 = checkRateLimit(testPhone, "Message Number One");
assert.equal(check1.allowed, true, "First message to new recipient should be allowed");

// Dispatch through sendSmsNotification in dry-run mode
const res1 = await sendSmsNotification({
  phone: testPhone,
  trackingNumber: "LUIS-TEST-001",
  eventType: "STATUS_OCULAR",
});
assert.equal(res1.success, true, "First sendSmsNotification should succeed (or simulate safely)");

// Immediate second message to same recipient should be blocked by cooldown (120s minimum gap)
const res2 = await sendSmsNotification({
  phone: testPhone,
  trackingNumber: "LUIS-TEST-001",
  eventType: "STATUS_FOR_PAYMENT",
});
assert.equal(res2.success, false, "Rapid second message must be blocked by cooldown");
assert.equal(res2.skipped, true, "Result should indicate message was safely skipped");
assert(res2.reason.includes("cooldown"), `Reason should mention cooldown. Got: ${res2.reason}`);
console.log(`✓ Recipient cooldown triggered successfully: "${res2.reason}"\n`);

// ── Test 5: Distinct Recipient Isolation ───────────────────────────────────────
console.log("5. Testing Multi-Recipient Isolation...");
const distinctPhone = "+639998887766";
const resDistinct = await sendSmsNotification({
  phone: distinctPhone,
  trackingNumber: "LUIS-TEST-002",
  eventType: "NEW_APPLICATION",
});
assert.equal(resDistinct.success, true, "Independent recipient should not be blocked by another recipient's cooldown");
console.log("✓ Multi-recipient isolation verified.\n");

// ── Test 6: Gateway Status & Metrics Diagnostics ──────────────────────────────
console.log("6. Testing SMS Status Diagnostics...");
process.env.TEXTBEE_API_KEY = realApiKey; // Restore actual configured key
const status = getSmsStatus();
assert.equal(status.provider, "textbee.dev");
assert.equal(status.configured, true, "Gateway should be configured with actual API Key");
assert(typeof status.quota.dailyLimit === "number");
assert(status.quota.sentToday >= 2, "Sent counter should reflect today's test dispatches");
assert(status.quota.blockedByRateLimit >= 1, "Blocked counter should track suppressed messages");
assert(Array.isArray(status.recentLogs), "Recent logs should be an array");
console.log("✓ Gateway status diagnostics reported:", {
  configured: status.configured,
  sentToday: status.quota.sentToday,
  blockedByRateLimit: status.quota.blockedByRateLimit,
  remainingToday: status.quota.remainingToday,
});

console.log("\n=========================================");
console.log("🎉 ALL TEXTBEE SMS & COST CONTROL TESTS PASSED!");
console.log("=========================================\n");
