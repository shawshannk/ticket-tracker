/**
 * The password policy from spec 10 §5.1, in one place because **both** sides need it: the API
 * enforces it on invite-accept and password-change, and the invite page renders it as a live
 * checklist while the user types. As with PERMISSIONS, the client copy is UX — the server's
 * call is the control.
 *
 * Deliberately absent: composition rules ("must contain a symbol") and expiry. Both are known
 * to push people toward predictable passwords and neither is required here.
 */

export const PASSWORD_MIN_LENGTH = 12;

/** The 100 most-breached passwords, lowercased. Length-12 filtered — see COMMON_PASSWORDS. */
const RAW_COMMON = [
  'password', '123456', '123456789', 'guest', 'qwerty', '12345678', '111111', '12345678910',
  'col123456', '123123', '1234567', '1234', '1234567890', '000000', '555555', '666666',
  '123321', '654321', '7777777', '123', 'd1lakiss', '777777', '110110jp', '1111', '987654321',
  '121212', 'abc123', 'qwertyuiop', '12345', '1q2w3e4r5t', '123456a', '1q2w3e4r', 'qwe123',
  '1qaz2wsx', 'monkey', 'dragon', '123qwe', '10203', 'iloveyou', 'password1', 'g_czechout',
  '112233', 'a123456', 'computer', 'qwerty123', 'letmein', 'password123', 'admin', 'welcome',
  'monkey123', 'sunshine', 'master', 'shadow', 'ashley', 'football', 'jesus', 'michael',
  'ninja', 'mustang', 'password12', 'passw0rd', 'trustno1', 'baseball', 'superman', 'batman',
  'starwars', 'whatever', 'freedom', 'princess', 'flower', 'hottie', 'loveme', 'zaq1zaq1',
  'access', 'login', 'hello', 'charlie', 'donald', 'qazwsx', 'q1w2e3r4', 'asdfghjkl',
  'zxcvbnm', 'iloveyou1', 'summer', 'internet', 'service', 'ranger', 'thomas', 'robert',
  'soccer', 'harley', 'buster', 'hunter', 'pepper', 'jordan23', 'liverpool', 'arsenal',
  'chelsea', 'letmein123', 'welcome123', 'admin123', 'root', 'toor', 'changeme',
  'qwerty12345', 'password1234', 'iloveyou123', 'princess123', 'sunshine123', 'football123',
  'baseball123', 'trustno1234', 'letmeinnow', 'passwordpassword', 'qwertyuiop123',
  'administrator', 'p@ssw0rd', 'p@ssword123', 'secret', 'secret123', 'default', 'temporary',
  'temp1234', 'changeme123', 'newpassword', 'newpassword1', 'mypassword', 'mypassword1',
];

/**
 * Only entries at or above the minimum length can ever be *submitted*, so the rest would be
 * rejected on length anyway. Filtering keeps the check meaningful rather than decorative.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  RAW_COMMON.filter((p) => p.length >= PASSWORD_MIN_LENGTH),
);

export type PasswordIssue = 'too_short' | 'too_common' | 'contains_identifier';

export const PASSWORD_ISSUE_MESSAGES: Record<PasswordIssue, string> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters`,
  too_common: 'This password appears in lists of commonly breached passwords',
  contains_identifier: "Don't reuse your name or email address",
};

export interface PasswordContext {
  email?: string;
  name?: string;
}

/**
 * Returns every way the password fails, not just the first — the invite page shows the whole
 * checklist at once, and an API error listing one problem at a time is a bad experience.
 * An empty array means the password is acceptable.
 */
export function checkPassword(password: string, context: PasswordContext = {}): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  const lowered = password.toLowerCase();

  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push('too_short');
  }

  if (COMMON_PASSWORDS.has(lowered)) {
    issues.push('too_common');
  }

  // The email's local part and the user's name are the two identifiers an attacker already
  // knows, so a password built from either is public knowledge plus padding.
  const identifiers = [context.email?.split('@')[0], context.name]
    .filter((v): v is string => Boolean(v && v.trim().length >= 3))
    .map((v) => v.toLowerCase().trim());

  if (identifiers.some((id) => lowered.includes(id))) {
    issues.push('contains_identifier');
  }

  return issues;
}

export function isPasswordAcceptable(password: string, context: PasswordContext = {}): boolean {
  return checkPassword(password, context).length === 0;
}
