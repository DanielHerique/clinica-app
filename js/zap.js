// js/zap.js
// Insere um botão flutuante do WhatsApp no DOM.
(function addZapFab(){
  if (document.getElementById("zap-fab")) return;
  const a = document.createElement("a");
  a.id = "zap-fab";
  a.className = "zap-fab";
  a.href = "https://wa.me/5541995178757";
  a.target = "_blank";
  a.rel = "noopener";
  a.title = "Falar no WhatsApp";
  a.innerHTML = `
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M19.1 17.6c-.3-.1-1.8-.9-2-.9s-.5-.1-.7.2-.8.9-.9 1.1-.3.2-.6.1a7.6 7.6 0 0 1-2.3-1.4 8.6 8.6 0 0 1-1.6-2c-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5s0-.4 0-.5 0-.5-.2-.7a2.4 2.4 0 0 0-.6-.5c-.2-.1-.5-.1-.7 0s-.9.3-1.2 1.1a4 4 0 0 0 .4 2.2 10.6 10.6 0 0 0 3.4 4.1 12 12 0 0 0 4.6 2 .4.4 0 0 0 .4-.2l1-1.3c.1-.2.2-.3.1-.5s-.3-.4-.6-.5zM16 3a13 13 0 0 0-11.3 19.3L3 29l6.8-1.8A13 13 0 1 0 16 3zm7.6 20.6a10.7 10.7 0 0 1-6.1 3.1 10.9 10.9 0 0 1-5.8-.6l-.4-.2-3.5.9.9-3.4-.2-.4a10.9 10.9 0 0 1-.6-5.8 10.7 10.7 0 0 1 3.1-6.1 10.6 10.6 0 0 1 18.1 7.5 10.6 10.6 0 0 1-2.5 6.0z"/>
    </svg>`;
  document.body.appendChild(a);
})();
