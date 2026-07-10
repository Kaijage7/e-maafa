package tz.go.pmo.dmis.iam;

import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Locale;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

/**
 * RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits) with Base32 secrets — no third-party TOTP library.
 * Used for optional staff 2FA enrollment and login verification.
 */
@Service
public class TotpService {

    private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final int STEP_SECONDS = 30;
    private static final int DIGITS = 6;
    private final SecureRandom random = new SecureRandom();

    /** New random 20-byte secret as Base32 (160-bit). */
    public String generateSecret() {
        byte[] raw = new byte[20];
        random.nextBytes(raw);
        return base32Encode(raw);
    }

    /** otpauth URI for authenticator apps (Google Authenticator, FreeOTP, etc.). */
    public String otpAuthUri(String issuer, String account, String secretBase32) {
        String label = urlEncode(issuer) + ":" + urlEncode(account);
        return "otpauth://totp/" + label
                + "?secret=" + secretBase32.replace("=", "")
                + "&issuer=" + urlEncode(issuer)
                + "&algorithm=SHA1&digits=" + DIGITS + "&period=" + STEP_SECONDS;
    }

    /** True if code matches current step or ±1 step (clock skew). */
    public boolean verify(String secretBase32, String code) {
        if (secretBase32 == null || code == null) {
            return false;
        }
        String digits = code.replaceAll("\\s", "");
        if (!digits.matches("\\d{6}")) {
            return false;
        }
        long counter = System.currentTimeMillis() / 1000L / STEP_SECONDS;
        for (long c = counter - 1; c <= counter + 1; c++) {
            if (generateCode(secretBase32, c).equals(digits)) {
                return true;
            }
        }
        return false;
    }

    public String generateCode(String secretBase32, long counter) {
        try {
            byte[] key = base32Decode(secretBase32);
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key, "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(counter).array());
            int offset = hash[hash.length - 1] & 0x0f;
            int binary = ((hash[offset] & 0x7f) << 24)
                    | ((hash[offset + 1] & 0xff) << 16)
                    | ((hash[offset + 2] & 0xff) << 8)
                    | (hash[offset + 3] & 0xff);
            int otp = binary % (int) Math.pow(10, DIGITS);
            return String.format(Locale.ROOT, "%0" + DIGITS + "d", otp);
        } catch (Exception e) {
            throw new IllegalStateException("TOTP generation failed", e);
        }
    }

    private static String base32Encode(byte[] data) {
        StringBuilder out = new StringBuilder((data.length * 8 + 4) / 5);
        int buffer = 0;
        int bitsLeft = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xff);
            bitsLeft += 8;
            while (bitsLeft >= 5) {
                out.append(BASE32.charAt((buffer >> (bitsLeft - 5)) & 31));
                bitsLeft -= 5;
            }
        }
        if (bitsLeft > 0) {
            out.append(BASE32.charAt((buffer << (5 - bitsLeft)) & 31));
        }
        return out.toString();
    }

    private static byte[] base32Decode(String encoded) {
        String s = encoded.toUpperCase(Locale.ROOT).replace("=", "").replace(" ", "");
        int bitBuffer = 0;
        int bitsLeft = 0;
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        for (int i = 0; i < s.length(); i++) {
            int val = BASE32.indexOf(s.charAt(i));
            if (val < 0) {
                continue;
            }
            bitBuffer = (bitBuffer << 5) | val;
            bitsLeft += 5;
            if (bitsLeft >= 8) {
                out.write((bitBuffer >> (bitsLeft - 8)) & 0xff);
                bitsLeft -= 8;
            }
        }
        return out.toByteArray();
    }

    private static String urlEncode(String s) {
        return java.net.URLEncoder.encode(s, java.nio.charset.StandardCharsets.UTF_8);
    }
}
