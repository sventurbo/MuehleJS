function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export class DockView {
  constructor({ onSend } = {}) {
    this.moveLogList = document.getElementById('move-log-list');
    this.chatMessages = document.getElementById('chat-messages');
    this.chatInput = document.getElementById('chat-input');
    this.chatForm = document.getElementById('chat-form');
    this.chatUnreadDot = document.getElementById('chat-unread-dot');

    this.tabs = Array.from(document.querySelectorAll('[data-dock-tab]'));
    this.panels = Array.from(document.querySelectorAll('[data-dock-panel]'));
    this.activeTab = 'log';
    this.myColor = null;

    this.tabs.forEach(tab => {
      tab.addEventListener('click', () => this.activateTab(tab.dataset.dockTab));
    });

    this.chatForm.addEventListener('submit', e => {
      e.preventDefault();
      const text = this.chatInput.value.trim();
      if (text && onSend) {
        onSend(text);
        this.chatInput.value = '';
      }
      this.chatInput.focus();
    });
  }

  reset(myColor) {
    this.myColor = myColor;
    this.chatMessages.replaceChildren();
    this.moveLogList.replaceChildren();
    this.activateTab('log');
  }

  activateTab(name) {
    if (!name) return;
    this.activeTab = name;

    this.tabs.forEach(tab => {
      tab.setAttribute('aria-selected', String(tab.dataset.dockTab === name));
    });

    this.panels.forEach(panel => {
      panel.classList.toggle('is-active', panel.dataset.dockPanel === name);
    });

    if (name === 'chat') {
      if (this.chatUnreadDot) this.chatUnreadDot.hidden = true;
      this.#scrollToBottom(this.chatMessages);
    }
  }

  addMove(text) {
    this.#appendLogEntry(text);
  }

  addSystemNote(text) {
    this.#appendLogEntry(text, 'log-system');
  }

  addChatMessage(msg) {
    const isMine = msg.color === this.myColor;

    const item = document.createElement('div');
    item.className = `chat-msg ${isMine ? 'chat-me' : 'chat-other'}`;
    const stone = `<span class="chat-stone chat-stone-${msg.color === 'W' ? 'w' : 'b'}" aria-hidden="true"></span>`;
    item.innerHTML = `
      <div class="chat-meta">${stone} <strong>${escapeHtml(msg.sender)}</strong></div>
      <div class="chat-bubble">${escapeHtml(msg.text)}</div>
    `;

    this.chatMessages.append(item);
    this.#scrollToBottom(this.chatMessages);

    if (!isMine && this.chatUnreadDot && this.#isTabbed() && this.activeTab !== 'chat') {
      this.chatUnreadDot.hidden = false;
    }
  }

  #appendLogEntry(text, className) {
    const entry = document.createElement('li');
    if (className) entry.className = className;
    entry.textContent = text;
    this.moveLogList.append(entry);
    this.#scrollToBottom(this.moveLogList);
  }

  #scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
  }

  #isTabbed() {
    const tabBar = document.querySelector('.dock-tabs');
    return !!tabBar && tabBar.offsetParent !== null;
  }
}
