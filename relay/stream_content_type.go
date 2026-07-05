package relay

import (
	"bufio"
	"bytes"
	"io"
	"net/http"
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

// peekedBody wraps a buffered reader together with the original closer, so the
// upstream response body can be peeked (to inspect its real format) without
// losing already-buffered bytes or leaking the underlying connection.
type peekedBody struct {
	r *bufio.Reader
	c io.Closer
}

func (p *peekedBody) Read(b []byte) (int, error) { return p.r.Read(b) }

func (p *peekedBody) Close() error {
	if p.c != nil {
		return p.c.Close()
	}
	return nil
}

// adjustIsStreamByContentType decides whether the upstream response should be
// handled as a stream, based on the upstream Content-Type — but guards against a
// common upstream quirk.
//
// Some upstream gateways / 号池 wrongly return `Content-Type: text/event-stream`
// even for NON-stream responses, where the body is actually a normal JSON object
// (e.g. {"object":"chat.completion",...}) rather than an SSE event stream. Blindly
// trusting the header (info.IsStream || isEventStream) would route a client's
// stream=false request into the SSE handler, which then finds no `data:` chunks,
// returns empty choices, and emits an SSE body the non-stream client cannot parse
// (JSON.parse on "event:"/"data:" => error).
//
// Behavior:
//   - upstream not event-stream         -> unchanged.
//   - client already requested stream   -> unchanged (header confirms it).
//   - client requested non-stream + upstream says event-stream -> peek the body:
//   - body looks like JSON ('{'/'[')  -> keep non-stream handling (mislabeled).
//   - body looks like SSE             -> fall back to stream handling (original).
//
// Only the mislabeled-JSON case changes behavior; genuine SSE handling is preserved.
func adjustIsStreamByContentType(info *relaycommon.RelayInfo, httpResp *http.Response) {
	if info == nil || httpResp == nil {
		return
	}
	if !strings.HasPrefix(httpResp.Header.Get("Content-Type"), "text/event-stream") {
		return
	}
	if info.IsStream {
		return
	}
	if httpResp.Body == nil {
		return
	}
	// Client wanted non-stream but upstream labeled the response as event-stream.
	// Peek the body without consuming it to tell a mislabeled JSON body from real SSE.
	br := bufio.NewReader(httpResp.Body)
	httpResp.Body = &peekedBody{r: br, c: httpResp.Body}
	prefix, _ := br.Peek(512)
	trimmed := bytes.TrimLeft(prefix, " \t\r\n")
	if len(trimmed) > 0 && (trimmed[0] == '{' || trimmed[0] == '[') {
		// Mislabeled JSON body: keep non-stream handling so it is parsed as JSON,
		// and correct the upstream Content-Type so it is not passed through to the
		// client as text/event-stream (downstream handlers copy upstream headers).
		httpResp.Header.Set("Content-Type", "application/json")
		return
	}
	// Genuine SSE body: preserve original behavior.
	info.IsStream = true
}
