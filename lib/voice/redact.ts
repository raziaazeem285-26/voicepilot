// PII redaction for transcripts before persistence.
// A card-number pattern alone is NOT full PII protection (advisor fix):
// names, phone numbers, emails, addresses, and sensitive conversation content
// also appear in transcripts. This redacts the machine-detectable classes;
// true anonymization of free-text names is a documented limitation.
const CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g;
const SSN_RE = /\b\d{3}[ -]?\d{2}[ -]?\d{4}\b/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
const CVV_RE = /\b(?:cvv|cvc|security code)[\s:]*\d{3,4}\b/gi;

export interface RedactionResult {
  text: string;
  redacted: string[]; // classes that were redacted, e.g. ["card", "email"]
}

/** Redact PII classes from a transcript turn's text. */
export function redactPii(text: string): RedactionResult {
  const redacted: string[] = [];
  let out = text;
  const apply = (re: RegExp, label: string, cls: string) => {
    re.lastIndex = 0;
    if (re.test(out)) {
      redacted.push(cls);
      re.lastIndex = 0;
      out = out.replace(re, label);
    }
  };
  apply(CARD_RE, "[CARD REDACTED]", "card");
  apply(CVV_RE, "[CVV REDACTED]", "cvv");
  apply(SSN_RE, "[SSN REDACTED]", "ssn");
  apply(EMAIL_RE, "[EMAIL REDACTED]", "email");
  // Phone numbers: redact only when they look like a full 10-11 digit number
  // (avoids mangling short numeric answers like "3" or times like "10 AM").
  const phoneFull = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  phoneFull.lastIndex = 0;
  if (phoneFull.test(out)) {
    redacted.push("phone");
    phoneFull.lastIndex = 0;
    out = out.replace(phoneFull, "[PHONE REDACTED]");
  }
  return { text: out, redacted };
}

/** Redact every turn of a transcript. Returns the redacted turns + classes found. */
export function redactTranscript(
  turns: { role: string; text: string; at?: string }[]
): { turns: { role: string; text: string; at?: string }[]; redactedClasses: string[] } {
  const classes = new Set<string>();
  const redactedTurns = turns.map(t => {
    const r = redactPii(t.text);
    r.redacted.forEach(c => classes.add(c));
    return { ...t, text: r.text };
  });
  return { turns: redactedTurns, redactedClasses: [...classes] };
}

// Keep the unused regex referenced for lint cleanliness (documents the pattern set).
void PHONE_RE;
