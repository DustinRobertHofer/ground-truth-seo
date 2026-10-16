/**
 * KNOWLEDGE.md §12, transcribed: the security checker's checks, how each one
 * confirms a match, what it says and the sources it cites. Strings are stored
 * exactly as in the knowledge base with Markdown backticks stripped;
 * knowledge.test.ts holds them to it. The detection constants below are the
 * values the Confirm lines name, so they are checked against that text too.
 *
 * Safe to import from client components: it holds strings and numbers only.
 */

export const EXPOSURE_CHECKS_VERSION = "1.1.0";

/** What an outsider can read when a check finds something (§12.1). Also the display order. */
export const EXPOSES_ORDER = ["credentials", "source code", "file paths"] as const;
export type Exposes = (typeof EXPOSES_ORDER)[number];

export interface SecurityCitation {
  source_id: string;
  section: string;
  quote: string;
  /** Emitted only for these conditions; null for every condition (§1.3). */
  conditions: readonly string[] | null;
}

export interface SecurityCondition {
  code: string;
  /** The `Found` line: when the condition is reported. */
  found: string;
  exposes: Exposes;
  /** Filled only from observed values (§12.3). */
  reason: string;
}

export interface SecurityCheck {
  id: string;
  title: string;
  /** The `Exposes` line as written. */
  exposesText: string;
  scope: string;
  inspect: string;
  confirm: string;
  conditions: readonly SecurityCondition[];
  fix: string;
  citations: readonly SecurityCitation[];
  notes: string | null;
}

/** §12.4, in order. */
export const SECURITY_CHECKS: readonly SecurityCheck[] = [
  {
    id: "SEC-VCS-01",
    title: "The Git repository is not served",
    exposesText: "source code",
    scope: "origin",
    inspect: "/.git/HEAD and /.git/config on the preferred origin.",
    confirm: "HTTP 200 and not an HTML body. For /.git/HEAD, the first line is ref: refs/ followed by a ref name, or a 40 or 64 character hexadecimal object name. For /.git/config, a line, with surrounding whitespace removed, reads [core].",
    conditions: [
      { code: "head", found: "/.git/HEAD is confirmed.", exposes: "source code", reason: "{url} returned a Git HEAD file, so the server publishes the site's Git repository. Git documents a \"dumb\" HTTP protocol that needs only a standard HTTP server, so anyone may be able to download the repository: its source code, its history and every secret ever committed to it." },
      { code: "config", found: "/.git/config is confirmed.", exposes: "source code", reason: "{url} returned a Git configuration file, so the server publishes the site's Git repository. Git documents a \"dumb\" HTTP protocol that needs only a standard HTTP server, so anyone may be able to download the repository: its source code, its history and every secret ever committed to it." },
    ],
    fix: "Deny every request whose path contains /.git/ at the web server or CDN, and deploy builds that leave the .git directory out of the served directory. Then treat every secret ever committed to the repository as exposed: revoke it and issue a replacement.",
    citations: [
      { source_id: "GIT-HTTP", section: "Description", quote: "A \"dumb\" protocol which requires only a standard HTTP server on the server end of the connection", conditions: null },
      { source_id: "OWASP-SECRETS", section: "1 Introduction", quote: "Many organizations have them hardcoded within the source code in plaintext, littered throughout configuration files and configuration management tools.", conditions: null },
      { source_id: "OWASP-SECRETS", section: "9.2 Remediation", quote: "Keys that were exposed should undergo immediate revocation.", conditions: null },
    ],
    notes: "A remote URL in the configuration file that carries a password is also reported by SEC-SECRET-03, because a confirmed /.git/config is served text.",
  },
  {
    id: "SEC-FILE-01",
    title: "Environment files are not served",
    exposesText: "credentials",
    scope: "file",
    inspect: "/.env, /.env.local, /.env.production, /.env.production.local and /.env.development on the preferred origin.",
    confirm: "HTTP 200, not an HTML body, and at least one line of the form NAME=value, optionally preceded by export , where such lines make up at least half of the lines that are neither blank nor comments starting with #. Lines inside a quoted value that spans several lines belong to its assignment.",
    conditions: [
      { code: "served", found: "the file is confirmed.", exposes: "credentials", reason: "{url} returned an environment file that sets {count} variables ({names}). OWASP lists .env among files that \"Should generally never be publicly served\", and every value in this one should now be treated as public." },
    ],
    fix: "Remove the file from the served directory and deny requests for paths that start with /.env at the web server or CDN. Revoke and replace every secret the file held, and keep secrets in the hosting platform's environment settings or a secret manager rather than in files under the web root.",
    citations: [
      { source_id: "OWASP-WSTG-CONF-04", section: "Sensitive File Extensions", quote: "Should generally never be publicly served", conditions: null },
      { source_id: "OWASP-WSTG-CONF-04", section: "Remediation", quote: "Data files, log files, configuration files, etc. should be stored in directories not accessible by the web server, to prevent both information disclosure and, where permissions allow writing, data modification.", conditions: null },
      { source_id: "NEXT-ENV", section: "Bundling Environment Variables for the Browser", quote: "Non-NEXT_PUBLIC_ environment variables are only available in the Node.js environment, meaning they aren't accessible to the browser", conditions: null },
      { source_id: "OWASP-SECRETS", section: "9.2 Remediation", quote: "Keys that were exposed should undergo immediate revocation.", conditions: null },
    ],
    notes: "{names} follows §12.2 rule 2. The finding also lists up to 100 names, so an owner knows which secrets to replace.",
  },
  {
    id: "SEC-FILE-02",
    title: "Credential files are not served",
    exposesText: "credentials",
    scope: "file",
    inspect: "/.git-credentials, /.npmrc and /.htpasswd on the preferred origin.",
    confirm: "HTTP 200 and not an HTML body. For /.git-credentials, at least one line of the form scheme://user:password@host, where such lines make up at least half of the non-blank lines. For /.npmrc, at least one line that sets _authToken, _auth or _password, optionally scoped as //registry/path:_authToken, to a value that does not start with ${. For /.htpasswd, at least one line of the form user:hash whose hash starts with $apr1$, $2a$, $2b$, $2y$, $5$, $6$ or {SHA}, where such lines make up at least half of the lines that are neither blank nor comments.",
    conditions: [
      { code: "git_credentials", found: "/.git-credentials is confirmed.", exposes: "credentials", reason: "{url} returned a Git credential store with {count} saved credentials for {hosts}. Git stores these passwords unencrypted, so anyone who requests this URL can read them." },
      { code: "npmrc", found: "/.npmrc is confirmed.", exposes: "credentials", reason: "{url} returned an npm configuration file with {count} registry credentials for {hosts}. OWASP lists .npmrc among files that \"Should generally never be publicly served\", and anyone who requests this URL can read them." },
      { code: "htpasswd", found: "/.htpasswd is confirmed.", exposes: "credentials", reason: "{url} returned a password file with {count} entries. OWASP lists .htpasswd among files that \"Should generally never be publicly served\", and anyone who requests this URL can read its user names and password hashes." },
    ],
    fix: "Remove the file from the served directory and deny requests for it at the web server or CDN. Revoke and replace every credential it held: the Git passwords and tokens, the npm tokens, or the password behind each hash.",
    citations: [
      { source_id: "OWASP-WSTG-CONF-04", section: "Sensitive File Extensions", quote: "Should generally never be publicly served", conditions: null },
      { source_id: "GIT-CRED-STORE", section: "Description", quote: "Using this helper will store your passwords unencrypted on disk, protected only by filesystem permissions.", conditions: ["git_credentials"] },
      { source_id: "OWASP-SECRETS", section: "9.2 Remediation", quote: "Keys that were exposed should undergo immediate revocation.", conditions: null },
    ],
    notes: "For /.npmrc, an unscoped credential line counts toward {hosts} as \"the default registry\".",
  },
  {
    id: "SEC-MAP-01",
    title: "Source maps do not publish the original source",
    exposesText: "source code (sources_content), file paths (paths_only)",
    scope: "source map",
    inspect: "the source map of each same-site script (§12.3).",
    confirm: "a confirmed source map, fetched with HTTP 200 or decoded from a data: URL.",
    conditions: [
      { code: "sources_content", found: "at least one sourcesContent entry is a string.", exposes: "source code", reason: "The source map for {script}{via_clause} lists {sources} source files ({paths}) and carries the original text of {content} of them. The source map format defines sourcesContent as a list of \"the original source\" strings, so anyone can read that code as it was written." },
      { code: "paths_only", found: "no sourcesContent entry is a string.", exposes: "file paths", reason: "The source map for {script}{via_clause} lists {sources} source files ({paths}) without their text. OWASP's testing guide notes that source maps released to production \"will make their source more human-readable\", and this one publishes the names and paths of the source files." },
    ],
    fix: "Stop publishing source maps in production: turn off browser source maps in the build, or upload them to your error tracker and delete them from the deployed files. Then search the original source for secrets; anything found there has been public.",
    citations: [
      { source_id: "OWASP-WSTG-INFO-05", section: "Summary", quote: "it is undeniable that source map files or files for debugging if released to the production environment will make their source more human-readable.", conditions: null },
      { source_id: "OWASP-WSTG-INFO-05", section: "Identifying Source Map Files", quote: "Testers can also find source map files by adding the \".map\" extension after the extension of each external JavaScript file.", conditions: null },
      { source_id: "ECMA-426", section: "Source map format", quote: "The sourcesContent field is an optional list of source content (i.e. the original source) strings, used when the source cannot be hosted.", conditions: ["sources_content"] },
      { source_id: "NEXT-SOURCEMAPS", section: "productionBrowserSourceMaps", quote: "During production builds, they are disabled to prevent you leaking your source on the client, unless you specifically opt-in with the configuration flag.", conditions: null },
    ],
    notes: "{via_clause} is \" at {map}, named by its sourcemap header,\", \" at {map}, named by its sourceMappingURL comment,\", \" at {map}, found by adding .map to its URL,\" or \", embedded in it as a data: URL,\". {paths} lists sources entries in map order. Text inside sourcesContent is served text, so the SEC-SECRET checks search it too.",
  },
  {
    id: "SEC-SECRET-01",
    title: "Pages and scripts carry no GitHub tokens",
    exposesText: "credentials",
    scope: "served file",
    inspect: "served text (§12.3).",
    confirm: "ghp_, gho_, ghu_, ghs_, ghr_ or github_pat_ followed by at least 36 characters from A-Z, a-z, 0-9 and _; or ghs_, digits, _ and three base64url segments separated by ., the stateless installation token format. The character before the prefix is not a letter, digit or _. A match whose characters after the prefix use fewer than 10 distinct characters is a placeholder and is ignored.",
    conditions: [
      { code: "github_token", found: "a confirmed match.", exposes: "credentials", reason: "{location} contains a GitHub {type}, recognized by its {prefix} prefix. GitHub issues tokens that begin with a prefix to indicate the token's type, and anyone who loads this file can read this one." },
    ],
    fix: "Revoke the token in GitHub now, remove it from the code or settings that produced this file, and issue a replacement that only the server can read. Every visitor can read what is sent to the browser, so no client-side code should hold a token.",
    citations: [
      { source_id: "GH-TOKENS", section: "GitHub's token formats", quote: "GitHub issues tokens that begin with a prefix to indicate the token's type.", conditions: null },
      { source_id: "OWASP-WSTG-INFO-05", section: "Identifying JavaScript Code and Gathering JavaScript Files", quote: "Check JavaScript code for any sensitive information leaks which could be used by attackers to further abuse or manipulate the system.", conditions: null },
      { source_id: "OWASP-SECRETS", section: "9.2 Remediation", quote: "Keys that were exposed should undergo immediate revocation.", conditions: null },
    ],
    notes: "{type} follows GH-TOKENS: ghp_ personal access token (classic), github_pat_ fine-grained personal access token, gho_ OAuth access token, ghu_ user access token for a GitHub App, ghs_ installation access token for a GitHub App, ghr_ refresh token for a GitHub App.",
  },
  {
    id: "SEC-SECRET-02",
    title: "Pages and scripts carry no private keys",
    exposesText: "credentials",
    scope: "served file",
    inspect: "served text (§12.3).",
    confirm: "the marker -----BEGIN PRIVATE KEY-----, -----BEGIN ENCRYPTED PRIVATE KEY-----, -----BEGIN RSA PRIVATE KEY-----, -----BEGIN EC PRIVATE KEY----- or -----BEGIN DSA PRIVATE KEY-----, followed within 16,384 characters by the matching -----END marker, where the text between them, once the escapes \\n and \\r are read as line breaks and \\/ as /, and header lines containing : and all whitespace are removed, is at least 64 characters long and uses only A-Z, a-z, 0-9, +, / and =. A shortened body, such as ... in documentation, is a placeholder and is ignored.",
    conditions: [
      { code: "private_key", found: "a confirmed block.", exposes: "credentials", reason: "{location} contains a complete PEM block labeled {label}, so anyone who loads this file can copy the private key. OWASP's testing guide tells testers to look in front-end code for \"API keys, internal IP addresses, sensitive routes, or credentials\"." },
    ],
    fix: "Treat the key as compromised: replace it everywhere it is trusted, revoke any certificate issued for it, and remove it from the code or file that serves it. A private key belongs only on the systems that use it.",
    citations: [
      { source_id: "OPENSSL-FORMAT", section: "PEM", quote: "Briefly, this is a block of base-64 encoding (defined in IETF RFC 4648), with specific lines used to mark the start and end", conditions: null },
      { source_id: "OWASP-WSTG-INFO-05", section: "Identifying JavaScript Code and Gathering JavaScript Files", quote: "Look for values such as: API keys, internal IP addresses, sensitive routes, or credentials.", conditions: null },
      { source_id: "OWASP-SECRETS", section: "9.2 Remediation", quote: "Keys that were exposed should undergo immediate revocation.", conditions: null },
    ],
    notes: "The labels are the private key types OpenSSL lists for PEM, including its legacy DSA PRIVATE KEY. {label} is the label as written, such as RSA PRIVATE KEY.",
  },
  {
    id: "SEC-SECRET-03",
    title: "URLs in pages and scripts carry no passwords",
    exposesText: "credentials",
    scope: "served file",
    inspect: "served text (§12.3).",
    confirm: "a scheme of 2 to 20 characters, ://, a user name, :, a non-empty password, @ and a host, where none of them contains whitespace, quotes, <, >, \\, /, ? or #, and the user name and host contain no : or @. Ignored as placeholders: a host that is example.com, example.net or example.org, or ends with . and one of those or with .example, .test or .invalid; a password that, compared without case, is password, pass, passwd, pwd, secret, changeme, mypassword, yourpassword, your_password or your-password; a password that contains ${, {{, <, [ or %s; a password made only of *, x, X and ..",
    conditions: [
      { code: "url_password", found: "a confirmed URL.", exposes: "credentials", reason: "{location} contains a {scheme} URL with a user name and password for {host}, and anyone who loads this file can read them. The URL Standard notes that \"There is no way to express a username or password of a URL record within a valid URL string.\"" },
    ],
    fix: "Change the password for that account now, remove the URL from the code or file that serves it, and have the server connect with credentials the browser never receives.",
    citations: [
      { source_id: "WHATWG-URL", section: "URL writing", quote: "There is no way to express a username or password of a URL record within a valid URL string.", conditions: null },
      { source_id: "OWASP-WSTG-INFO-05", section: "Identifying JavaScript Code and Gathering JavaScript Files", quote: "Look for values such as: API keys, internal IP addresses, sensitive routes, or credentials.", conditions: null },
      { source_id: "OWASP-SECRETS", section: "9.2 Remediation", quote: "Keys that were exposed should undergo immediate revocation.", conditions: null },
    ],
    notes: "{scheme} is lowercased; {host} is the host as written, lowercased.",
  },
  {
    id: "SEC-SECRET-04",
    title: "Pages and scripts assign no values to names that mark a secret",
    exposesText: "credentials",
    scope: "served file",
    inspect: "served text (§12.3).",
    confirm: "a name followed by : or = and a quoted string (§12.3). The name is an identifier, or a quoted key, of at most 64 characters which, lowercased with _, -, . and $ removed, contains secret, password, passwd or privatekey. The value is 16 to 512 characters from A-Z, a-z, 0-9, _, -, +, /, = and ., contains a letter and a digit, uses at least 8 distinct characters and does not start with / or .. Ignored as placeholders: a value that, lowercased, contains your, example, placeholder, xxxx, changeme, redacted, dummy or sample, and a value that contains the name itself, compared without case, as a generated class name does. A value that SEC-SECRET-01 already reports at the same position is not reported again.",
    conditions: [
      { code: "named_value", found: "a confirmed assignment.", exposes: "credentials", reason: "{location} assigns a value to {name}, a name that marks a secret, and anyone who loads this file can read the value. OWASP's testing guide warns that \"many programmers also hardcode sensitive information in JavaScript variables on the frontend\"." },
    ],
    fix: "Check whether the value is a live secret. If it is, revoke and replace it and move the code that uses it to the server, because a value a build writes into browser JavaScript is readable by every visitor. If it is meant to be public, rename it so it no longer reads as a secret.",
    citations: [
      { source_id: "OWASP-WSTG-INFO-05", section: "Summary", quote: "Similar to the comments and metadata in HTML code, many programmers also hardcode sensitive information in JavaScript variables on the frontend.", conditions: null },
      { source_id: "NEXT-ENV", section: "Bundling Environment Variables for the Browser", quote: "It will be inlined into any JavaScript sent to the browser.", conditions: null },
      { source_id: "OWASP-SECRETS", section: "9.2 Remediation", quote: "Keys that were exposed should undergo immediate revocation.", conditions: null },
    ],
    notes: "This check reads names, not formats, so it can report a value that is not a live secret; its fix starts with checking. {name} is the name as written. Quotes may be escaped (§12.3 Quoted string), so it also reads the data a page embeds for its scripts.",
  },
  {
    id: "SEC-DATA-01",
    title: "Pages and scripts carry no access codes",
    exposesText: "credentials",
    scope: "served file",
    inspect: "served text (§12.3).",
    confirm: "a name followed by : or = and a value. The name is an identifier or a quoted string (§12.3) of at most 64 characters. Folded (§12.3 Name words), it ends with an access word, access, alarm, checkin, door, entry, garage, gate, keybox, keypad, keysafe, lock, lockbox, smartlock or wifi, followed by code, combination, passcode, password or pin, and the access word starts one of the name's words. The value is a quoted string of 3 to 64 characters that contains a digit, contains no whitespace, quote, backslash, &, <, >, { or }, and does not start with $; or an integer of 3 to 16 digits that no letter, digit, _ or . follows. Ignored as placeholders: a value made of one repeated character, such as 0000 or ****; a value that, lowercased, contains one of the placeholder words of SEC-SECRET-04; and a value that, folded, contains the folded name. A value that SEC-SECRET-01 or SEC-SECRET-04 already reports at the same position is not reported again.",
    conditions: [
      { code: "access_code", found: "a confirmed assignment.", exposes: "credentials", reason: "{location} assigns a value to {name}, a name that marks an access code, so anyone who loads this file can read the code, whether or not the page displays it. OWASP's API security guidance describes the cause: \"The API endpoint exposes properties of an object that are considered sensitive and should not be read by the user.\"" },
    ],
    fix: "Change the code now, because it has been public. Then stop sending it: build the data each page and script receives from a list of the properties it displays, rather than passing a whole record from the database, and send a code only in a response that first confirms the visitor may see it.",
    citations: [
      { source_id: "OWASP-API3", section: "Is the API Vulnerable?", quote: "The API endpoint exposes properties of an object that are considered sensitive and should not be read by the user.", conditions: null },
      { source_id: "OWASP-API3", section: "How To Prevent", quote: "Avoid using generic methods such as to_json() and to_string(). Instead, cherry-pick specific object properties you specifically want to return.", conditions: null },
      { source_id: "NEXT-DATA-SECURITY", section: "Passing data from server to client", quote: "This ensures the app is secure by default, but it's possible to accidentally expose private data through how data is fetched or passed to components.", conditions: null },
      { source_id: "REACT-TAINT-OBJECT", section: "Prevent user data from unintentionally reaching the client", quote: "A Client Component should never accept objects that carry sensitive data.", conditions: null },
    ],
    notes: "A code has no format to recognize, so this check reads names, and it can report a value that is not a live code, such as an expired one kept in the record. The access words are the scanner's own list. {name} is the name as written.",
  },
  {
    id: "SEC-DATA-02",
    title: "Pages and scripts carry no password hashes",
    exposesText: "credentials",
    scope: "served file",
    inspect: "served text (§12.3).",
    confirm: "a name followed by : or = and a quoted string (§12.3). The name is an identifier or a quoted string of at most 64 characters which, folded (§12.3 Name words), contains password or passwd. The value starts with $2a$, $2b$, $2y$, $argon2id$, $argon2i$, $argon2d$, $5$ or $6$, is 40 to 512 characters long and contains no whitespace, quote, backslash, &, < or >. A value whose characters after the prefix use fewer than 10 distinct characters is a placeholder and is ignored.",
    conditions: [
      { code: "password_hash", found: "a confirmed assignment.", exposes: "credentials", reason: "{location} assigns a password hash, recognized by its {prefix} prefix, to {name}, so anyone who loads this file can copy it. React's documentation names a hash among the values that \"should not be allowed to be passed to the Client as is\"." },
    ],
    fix: "Have every account whose hash was served set a new password. Then stop sending the field: build the data each page and script receives from a list of the properties it displays, never from a whole user record, and keep password hashes on the server.",
    citations: [
      { source_id: "REACT-TAINT-VALUE", section: "taintUniqueValue(message, lifetime, value)", quote: "Call taintUniqueValue with a password, token, key or hash to register it with React as something that should not be allowed to be passed to the Client as is", conditions: null },
      { source_id: "OWASP-API3", section: "How To Prevent", quote: "Avoid using generic methods such as to_json() and to_string(). Instead, cherry-pick specific object properties you specifically want to return.", conditions: null },
      { source_id: "NEXT-DATA-SECURITY", section: "Component-level data access", quote: "You should sanitize the data before passing it to the Client Component", conditions: null },
    ],
    notes: "{prefix} is the prefix as written, such as $2b$. The prefix list is the scanner's own.",
  },
];

export const SECURITY_CHECKS_BY_ID = new Map(SECURITY_CHECKS.map((c) => [c.id, c]));

export function securityCheck(id: string): SecurityCheck {
  const check = SECURITY_CHECKS_BY_ID.get(id);
  if (!check) throw new Error(`Unknown security check ${id}`);
  return check;
}

export function securityCondition(checkId: string, code: string): SecurityCondition {
  const condition = securityCheck(checkId).conditions.find((c) => c.code === code);
  if (!condition) throw new Error(`Unknown condition ${checkId} ${code}`);
  return condition;
}

/** Citations a finding of this condition emits. */
export function citationsFor(checkId: string, code: string): SecurityCitation[] {
  return securityCheck(checkId).citations.filter((c) => c.conditions === null || c.conditions.includes(code));
}

export type SecurityStatementKey =
  | "redaction"
  | "scope"
  | "not_checked_robots"
  | "not_checked_failed"
  | "not_checked_truncated"
  | "not_checked_budget"
  | "searched_partly"
  | "no_pages"
  | "no_scripts"
  | "search_scope"
  | "search_none"
  | "search_property";

/** §12.5. */
export const SECURITY_STATEMENTS: readonly { key: SecurityStatementKey; text: string }[] = [
  { key: "redaction", text: "Values are never shown or stored. Each finding names the kind of secret and where it was found, so you can locate it and revoke it." },
  { key: "scope", text: "A clean result means none of these checks matched in what the site served to this check. It does not prove the site holds no secrets: the check reads a few pages, their same-site scripts and source maps, and a fixed list of paths." },
  { key: "not_checked_robots", text: "robots.txt disallows the scanner from {url}, so it was not requested." },
  { key: "not_checked_failed", text: "{url} could not be fetched ({outcome})." },
  { key: "not_checked_truncated", text: "{url} is larger than the check reads, so its content could not be confirmed." },
  { key: "searched_partly", text: "{url} is larger than the check reads, so only its first part was searched." },
  { key: "not_checked_budget", text: "{url} was not requested because the check had already read as much as it reads in one run." },
  { key: "no_pages", text: "No page loaded, so there was no served text to search." },
  { key: "no_scripts", text: "The loaded pages reference no same-site scripts, so there were no source maps to look for." },
  { key: "search_scope", text: "The search reads the same served text as the checks. It lists where each term appears and, when a term ends a property name, the kind of value the property holds, never the value or the text around it." },
  { key: "search_none", text: "Not found in the served text." },
  { key: "search_property", text: "The term ends a property name here, and the property holds {kind}." },
];

export function securityStatement(key: SecurityStatementKey): string {
  return SECURITY_STATEMENTS.find((s) => s.key === key)!.text;
}

/** §12.2, in order: what a finding may and may not carry. */
export const REDACTION_RULES: readonly string[] = [
  "Never emit, store or log a matched value. A finding names the kind of value, where it was found (the URL, the line and column, and the source file when the value sits inside a source map) and the fields its template lists. Nothing else from a response body leaves the evaluation.",
  "From an environment file, emit variable names only, never values. A name is emitted only when it matches [A-Za-z_][A-Za-z0-9_.]* and is at most 64 characters long; other names are counted but not shown.",
  "From a URL that carries a password, emit its scheme and host only, never the user name or the password.",
  "From a credential file, emit counts and host names only, never user names.",
  "A check is not saved. Its result is not written to scan history, the research corpus or the browser's saved scans, and the fetched bodies are discarded once the result is built.",
  "A matched value of four or more characters can also appear where the result names a place, such as a token in a script URL's query string. Before the result leaves the evaluation, every occurrence of such a value anywhere in it is replaced with [redacted]. Access codes (SEC-DATA-01) are the exception: a code is short enough to match a date or a number elsewhere in the result by chance, and replacing that would reveal the code. The one place a code is replaced is a search term the result repeats (§12.7), compared without case, because a term that contains a code would otherwise repeat it.",
];

/** §12.6: what the checker does not report. */
export const NOT_REPORTED: readonly string[] = [
  "Provider key formats other than GitHub's are not matched, because no owner's documentation of those formats is registered in SOURCES.md. A value in another format is still reported when it is assigned to a name that marks a secret (SEC-SECRET-04).",
  "Keys that providers issue for use in browsers are not judged. Whether such a key is restricted cannot be seen from outside the site.",
  "Personal data, such as names, email addresses and phone numbers, is not judged, because pages often show it on purpose. A search of the served text (§12.7) for the names of fields your pages should never send finds them.",
  "The checker sends only GET requests, never signs in, never requests a path that robots.txt disallows for it, and never fetches a script or source map from another site.",
];

/** §12.1: OWASP's rule that a status code alone is never a finding. */
export const CONFIRMATION_QUOTE = {
  source_id: "OWASP-WSTG-CONF-04",
  section: "Sensitive File Extensions",
  quote: "A hit in any category is a candidate finding only - confirm the response actually returns the file's content (not a custom 404 or an access-denied page), and read enough of that content to confirm it is genuinely sensitive, before reporting it.",
} as const;

// --------------------------------------------------- detection constants
// Each value below is named in a Confirm, Inspect or Notes line of §12.4.

export interface Probe {
  path: string;
  check: "SEC-VCS-01" | "SEC-FILE-01" | "SEC-FILE-02";
  /** The condition a confirmed response reports. */
  condition: string;
}

/** The fixed file paths requested on the preferred origin, in Inspect order. */
export const PROBES: readonly Probe[] = [
  { path: "/.git/HEAD", check: "SEC-VCS-01", condition: "head" },
  { path: "/.git/config", check: "SEC-VCS-01", condition: "config" },
  { path: "/.env", check: "SEC-FILE-01", condition: "served" },
  { path: "/.env.local", check: "SEC-FILE-01", condition: "served" },
  { path: "/.env.production", check: "SEC-FILE-01", condition: "served" },
  { path: "/.env.production.local", check: "SEC-FILE-01", condition: "served" },
  { path: "/.env.development", check: "SEC-FILE-01", condition: "served" },
  { path: "/.git-credentials", check: "SEC-FILE-02", condition: "git_credentials" },
  { path: "/.npmrc", check: "SEC-FILE-02", condition: "npmrc" },
  { path: "/.htpasswd", check: "SEC-FILE-02", condition: "htpasswd" },
];

/** SEC-SECRET-01 Notes: GitHub's token prefixes and what each names (GH-TOKENS). */
export const GITHUB_TOKEN_TYPES: readonly { prefix: string; type: string }[] = [
  { prefix: "ghp_", type: "personal access token (classic)" },
  { prefix: "github_pat_", type: "fine-grained personal access token" },
  { prefix: "gho_", type: "OAuth access token" },
  { prefix: "ghu_", type: "user access token for a GitHub App" },
  { prefix: "ghs_", type: "installation access token for a GitHub App" },
  { prefix: "ghr_", type: "refresh token for a GitHub App" },
];

/** SEC-SECRET-02: the PEM private key labels OpenSSL lists. */
export const PEM_PRIVATE_KEY_LABELS = ["PRIVATE KEY", "ENCRYPTED PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY", "DSA PRIVATE KEY"] as const;

/** SEC-SECRET-04: a name marks a secret when its folded form contains one of these. */
export const SECRET_NAME_MARKERS = ["secret", "password", "passwd", "privatekey"] as const;
/** SEC-SECRET-04: values containing one of these (lowercased) are placeholders. */
export const VALUE_PLACEHOLDERS = ["your", "example", "placeholder", "xxxx", "changeme", "redacted", "dummy", "sample"] as const;

/** SEC-DATA-01: a folded name ends with an access word followed by a code word (§12.3 Name words). */
export const ACCESS_WORDS = ["access", "alarm", "checkin", "door", "entry", "garage", "gate", "keybox", "keypad", "keysafe", "lock", "lockbox", "smartlock", "wifi"] as const;
export const ACCESS_CODE_WORDS = ["code", "combination", "passcode", "password", "pin"] as const;

/** SEC-DATA-02: a folded name containing one of these holds a password; a value starting with a prefix is a hash. */
export const PASSWORD_NAME_MARKERS = ["password", "passwd"] as const;
export const PASSWORD_HASH_PREFIXES = ["$2a$", "$2b$", "$2y$", "$argon2id$", "$argon2i$", "$argon2d$", "$5$", "$6$"] as const;

/** SEC-SECRET-03: hosts reserved for documentation, and passwords that are placeholders. */
export const PLACEHOLDER_HOSTS = ["example.com", "example.net", "example.org"] as const;
export const PLACEHOLDER_HOST_SUFFIXES = [".example", ".test", ".invalid"] as const;
export const PLACEHOLDER_PASSWORDS = ["password", "pass", "passwd", "pwd", "secret", "changeme", "mypassword", "yourpassword", "your_password", "your-password"] as const;
export const PLACEHOLDER_PASSWORD_FRAGMENTS = ["${", "{{", "<", "[", "%s"] as const;

/** SEC-FILE-02: npm credential keys and .htpasswd hash prefixes. */
export const NPM_AUTH_KEYS = ["_authToken", "_auth", "_password"] as const;
export const HTPASSWD_HASH_PREFIXES = ["$apr1$", "$2a$", "$2b$", "$2y$", "$5$", "$6$", "{SHA}"] as const;

/** Numbers the Confirm and Notes lines state. */
export const DETECTION_LIMITS = {
  /** SEC-SECRET-01: characters after a token prefix, and distinct characters below which a match is a placeholder. */
  tokenMinLength: 36,
  tokenMinDistinct: 10,
  /** SEC-SECRET-02: how far the END marker may be, and the shortest key body. */
  pemWindow: 16_384,
  pemMinBody: 64,
  /** SEC-SECRET-03: scheme length. */
  schemeMin: 2,
  schemeMax: 20,
  /** SEC-SECRET-04: name and value bounds. */
  nameMax: 64,
  valueMin: 16,
  valueMax: 512,
  valueMinDistinct: 8,
  /** §12.2 rule 2: longest environment variable name shown. */
  envNameMax: 64,
  /** SEC-FILE-01 Notes: names listed on a finding. */
  envNamesListed: 100,
  /** §12.3 Lists: members a {names} or {paths} fill shows. */
  listShown: 10,
  /** §12.2 rule 6: shortest matched value scrubbed from the whole result. */
  scrubMin: 4,
  /** SEC-DATA-01: quoted code length, and digits in an unquoted one. */
  codeMin: 3,
  codeMax: 64,
  codeDigitsMin: 3,
  codeDigitsMax: 16,
  /** SEC-DATA-02: hash length, and distinct characters after the prefix below which a match is a placeholder. */
  hashMin: 40,
  hashMax: 512,
  hashMinDistinct: 10,
} as const;

// ------------------------------------------------------------------ search
// §12.7: searching the served text for terms the person running the check enters.

/** The bounds §12.7 states. */
export const SEARCH_LIMITS = {
  terms: 5,
  termMin: 3,
  termMax: 100,
  /** Occurrences listed per term; the count covers all of them. */
  listed: 50,
} as const;

export type ValueKind = "empty_string" | "undefined" | "string" | "number" | "boolean" | "null" | "object" | "array" | "other";

/** §12.7 value kinds, in table order: how a matching property's value is described. */
export const VALUE_KINDS: readonly { kind: ValueKind; value: string; text: string }[] = [
  { kind: "empty_string", value: "a quoted string with nothing between its quotes", text: "an empty string" },
  { kind: "undefined", value: "the word undefined, or the quoted string $undefined", text: "undefined" },
  { kind: "string", value: "any other quoted string", text: "a string" },
  { kind: "number", value: "a digit, or - followed by a digit", text: "a number" },
  { kind: "boolean", value: "the word true or false", text: "a boolean" },
  { kind: "null", value: "the word null", text: "null" },
  { kind: "object", value: "{", text: "an object" },
  { kind: "array", value: "[", text: "an array" },
  { kind: "other", value: "anything else, such as a variable", text: "an expression" },
];

export function valueKindText(kind: ValueKind): string {
  return VALUE_KINDS.find((k) => k.kind === kind)!.text;
}
