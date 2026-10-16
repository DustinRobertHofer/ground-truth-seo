/**
 * Fake secrets for the security checker's fixtures. Each is assembled at
 * runtime so no token-shaped literal is committed, and none is a live
 * credential: the GitHub tokens fail GitHub's checksum and the key bodies are
 * truncated.
 */

const join = (...parts: string[]) => parts.join("");
const BODY36 = "Zq8Lr2Vn5Xt7Bw1Mk4Hp9Jd3Fs6Gy0Ce8Ua2";

export const FAKE = {
  classic: join("gh", "p_", BODY36),
  oauth: join("gh", "o_", "Pw3Ks9Ld2Mf7Ng1Hb6Jc4Vx8Zt5Qr0Ye2Ua7"),
  fineGrained: join("github", "_pat_", "11AB", BODY36, "_", BODY36),
  stateless: join("gh", "s_", "123456_", "eyJhbGciOiJSUzI1NiJ9", ".", "eyJpc3MiOiIxMjMifQ", ".", "c2lnbmF0dXJlLXZhbHVlXzEyMw"),
  dbPassword: join("Tr0ub4", "dor3x"),
  hexSecret: join("a8f5f167f44f", "4964e6c998dee827110c"),
  envValue: join("sk_li", "ve_51HxQ2", "Kd8Lm3Nf9"),
  /** A bcrypt-shaped and an Argon2-shaped password hash; neither hashes a real password. */
  bcrypt: join("$2", "b$12$", "Lq3Zt8Vn1Xw5Bk7Mp2Hd9J", "f4Gy6Ce0Ua3Rs8Tn2Wq5Ex7Zb1Kv9LmQ"),
  argon2: join("$argon2", "id$v=19$m=65536,t=3,p=4$", "c2FsdHNhbHRzYWx0", "$", "Rk3Zq8Lr2Vn5Xt7Bw1Mk4Hp9Jd3Fs6Gy0Ce8Ua2Pw"),
  /** Access codes distinctive enough that no line number, URL or date in a result contains them by chance. */
  lockboxCode: join("K7Q4", "-93"),
  gateCode: join("7391", "64"),
  pem(label: string, escaped = false): string {
    const nl = escaped ? "\\n" : "\n";
    const body = ["MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7", "VJTUt9Us8cKjMzEfYyjiWA4R4/M2bS1GB4t7NXp98C3SC6dVMvDu"].join(nl);
    return join("-----BEGIN ", label, "-----", nl, body, nl, "-----END ", label, "-----");
  },
};
