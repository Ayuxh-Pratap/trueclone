// trueclone test fixture (our own code): a third-party widget from another origin, as allbirds' AI shopping assistant
// was: a fixed launcher in a shadow root, injected after load, whose text and position vary per visit.
(() => {
  const host = document.createElement('div');
  host.id = 'ads-agent-host';
  const root = host.attachShadow({ mode: 'open' });
  const nudges = ['Need help choosing?', 'Ask our assistant', 'Find your size'];
  const pick = nudges[Math.floor(Date.now() / 1000) % nudges.length];
  root.innerHTML = `<style>.l{position:fixed;right:16px;bottom:${16 + (Date.now() % 3) * 40}px;background:#111;color:#fff;border-radius:24px;padding:10px 16px;font:14px system-ui}</style><div class="l">${pick}</div>`;
  setTimeout(() => document.body.append(host), 300);
})();
