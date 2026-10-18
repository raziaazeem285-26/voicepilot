// Unit tests: PII redaction.
import { describe, expect, it } from "vitest";
import { redactPii, redactTranscript } from "./redact";

describe("redactPii", () => {
  it("redacts card numbers", () => {
    const r = redactPii("my card is 4111 1111 1111 1111 please");
    expect(r.text).toContain("[CARD REDACTED]");
    expect(r.text).not.toContain("4111");
    expect(r.redacted).toContain("card");
  });
  it("redacts emails", () => {
    const r = redactPii("email me at jane.doe@example.com ok");
    expect(r.text).toContain("[EMAIL REDACTED]");
    expect(r.redacted).toContain("email");
  });
  it("redacts full phone numbers", () => {
    const r = redactPii("call me back at (555) 123-4567 tomorrow");
    expect(r.text).toContain("[PHONE REDACTED]");
    expect(r.redacted).toContain("phone");
  });
  it("does not mangle short numeric answers or times", () => {
    const r = redactPii("the first one please, 10 AM works");
    expect(r.text).toBe("the first one please, 10 AM works");
    expect(r.redacted).toHaveLength(0);
  });
  it("redacts SSNs", () => {
    const r = redactPii("ssn 123-45-6789");
    expect(r.text).toContain("[SSN REDACTED]");
  });
  it("leaves clean text untouched", () => {
    const r = redactPii("My kitchen sink is leaking");
    expect(r.text).toBe("My kitchen sink is leaking");
    expect(r.redacted).toHaveLength(0);
  });
});

describe("redactTranscript", () => {
  it("redacts across turns and reports classes", () => {
    const { turns, redactedClasses } = redactTranscript([
      { role: "caller", text: "my email is bob@example.com" },
      { role: "agent", text: "Thanks!" },
    ]);
    expect(turns[0].text).toContain("[EMAIL REDACTED]");
    expect(turns[1].text).toBe("Thanks!");
    expect(redactedClasses).toContain("email");
  });
});
