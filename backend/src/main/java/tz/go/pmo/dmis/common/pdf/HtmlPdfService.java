package tz.go.pmo.dmis.common.pdf;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import java.io.ByteArrayOutputStream;
import org.jsoup.Jsoup;
import org.jsoup.helper.W3CDom;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.common.error.BusinessRuleException;

/**
 * HTML → PDF for generated official documents (NDRF annex filings). The client renders the
 * document from the SAME schema that drives the keying form and posts the self-contained
 * HTML here; conversion is pure server-side layout — no scripts execute and no external
 * resources are fetched (the HTML carries inline CSS only), so caller-supplied markup can
 * at worst style itself badly.
 */
@Service
public class HtmlPdfService {

    private static final int MAX_HTML_BYTES = 2_000_000;

    public byte[] render(String html) {
        if (html == null || html.isBlank()) {
            throw new BusinessRuleException("The document HTML is empty.");
        }
        if (html.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_HTML_BYTES) {
            throw new BusinessRuleException("The document is too large to convert.");
        }
        try {
            var w3cDoc = new W3CDom().fromJsoup(Jsoup.parse(html));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            builder.withW3cDocument(w3cDoc, null); // null base URI: no external resource resolution
            builder.toStream(out);
            builder.run();
            return out.toByteArray();
        } catch (Exception e) {
            throw new BusinessRuleException("The document could not be converted to PDF: " + e.getMessage());
        }
    }
}
