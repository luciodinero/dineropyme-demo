// Diálogos propios de la app (confirmación / aviso / toast) en vez de los
// nativos del navegador (confirm/alert). Los diálogos nativos quedan
// bloqueados dentro del iframe donde vive la página publicada, así que
// confirm() devuelve "falso" sin llegar a preguntar nada y alert() no se ve
// — con lo que botones como "Cancelar" parecían no hacer nada. Esto evita
// depender de ellos.
const DPUI = (() => {
  function ensureDom() {
    if (document.getElementById('dp-ui-root')) return;
    const root = document.createElement('div');
    root.id = 'dp-ui-root';
    root.innerHTML = `
      <div class="modal-backdrop" id="dp-modal-backdrop">
        <div class="modal">
          <h3 id="dp-modal-title" style="display:none"></h3>
          <p id="dp-modal-body" style="white-space:pre-wrap;font-size:0.92rem;color:var(--ink-soft);line-height:1.5;margin:0"></p>
          <div class="modal-actions" id="dp-modal-actions"></div>
        </div>
      </div>
      <div class="dp-toast" id="dp-toast"></div>
    `;
    document.body.appendChild(root);
  }

  function confirmDialog(message, opts) {
    opts = opts || {};
    const okText = opts.okText || 'Confirmar';
    const cancelText = opts.cancelText || 'Cancelar';
    const title = opts.title || '';
    ensureDom();
    return new Promise((resolve) => {
      const backdrop = document.getElementById('dp-modal-backdrop');
      const titleEl = document.getElementById('dp-modal-title');
      titleEl.textContent = title;
      titleEl.style.display = title ? 'block' : 'none';
      document.getElementById('dp-modal-body').textContent = message;

      const actions = document.getElementById('dp-modal-actions');
      actions.innerHTML = '';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-cancel';
      cancelBtn.textContent = cancelText;
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'primary';
      okBtn.style.marginTop = '0';
      okBtn.textContent = okText;
      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);

      function close(result) {
        backdrop.classList.remove('open');
        resolve(result);
      }
      cancelBtn.onclick = () => close(false);
      okBtn.onclick = () => close(true);
      backdrop.classList.add('open');
    });
  }

  function infoDialog(message, opts) {
    opts = opts || {};
    const okText = opts.okText || 'Entendido';
    const title = opts.title || '';
    ensureDom();
    return new Promise((resolve) => {
      const backdrop = document.getElementById('dp-modal-backdrop');
      const titleEl = document.getElementById('dp-modal-title');
      titleEl.textContent = title;
      titleEl.style.display = title ? 'block' : 'none';
      document.getElementById('dp-modal-body').textContent = message;

      const actions = document.getElementById('dp-modal-actions');
      actions.innerHTML = '';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'primary';
      okBtn.style.marginTop = '0';
      okBtn.style.flex = '1';
      okBtn.textContent = okText;
      actions.appendChild(okBtn);

      function close() {
        backdrop.classList.remove('open');
        resolve();
      }
      okBtn.onclick = close;
      backdrop.classList.add('open');
    });
  }

  let toastTimer = null;
  function toast(message, ms) {
    ensureDom();
    const el = document.getElementById('dp-toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms || 2800);
  }

  return { confirm: confirmDialog, info: infoDialog, toast };
})();
