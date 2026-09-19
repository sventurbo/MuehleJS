/**
 * dockView.js
 * The dock below the board: the move log and the chat.
 *
 * On desktop both panels are visible side by side; on a phone they share one
 * slot behind a tab bar, which is why this view also owns the tabs and the
 * unread marker on the chat tab.
 *
 * Every string that comes from the other player (their name, their message) is
 * written through escapeHtml() or textContent. The server deliberately does not
 * escape, so this is the boundary where markup is made safe.
 */

(function (window, document) {
  'use strict';

  /** Escapes text for the one place that has to build markup by hand. */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  class DockView {
    /**
     * @param {Object} handlers
     * @param {Function} handlers.onSend Called with the typed chat message.
     */
    constructor({ onSend } = {}) {
      this.moveLogList = document.getElementById('move-log-list');
      this.chatMessages = document.getElementById('chat-messages');
      this.chatInput = document.getElementById('chat-input');
      this.chatForm = document.getElementById('chat-form');
      this.chatUnreadDot = document.getElementById('chat-unread-dot');

      this.tabs = Array.from(document.querySelectorAll('[data-dock-tab]'));
      this.panels = Array.from(document.querySelectorAll('[data-dock-panel]'));
      this.activeTab = 'log';
      this.myName = '';

      this.tabs.forEach(tab => {
        tab.addEventListener('click', () => this.activateTab(tab.dataset.dockTab));
      });

      this.chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = this.chatInput.value.trim();
        if (text && onSend) {
          onSend(text);
          this.chatInput.value = '';
        }
        this.chatInput.focus();
      });
    }

    /** Empties log and chat for a new game and shows the log tab. */
    reset(myName) {
      this.myName = myName;
      this.chatMessages.innerHTML = '';
      this.moveLogList.innerHTML = '';
      this.activateTab('log');
    }

    /**
     * Switches the small-screen dock between move log and chat.
     * On desktop both panels are visible, so this only tracks which one is
     * "current" for the unread marker.
     */
    activateTab(name) {
      if (!name) return;
      this.activeTab = name;

      this.tabs.forEach(tab => {
        const isActive = tab.dataset.dockTab === name;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      this.panels.forEach(panel => {
        panel.classList.toggle('is-active', panel.dataset.dockPanel === name);
      });

      if (name === 'chat') {
        if (this.chatUnreadDot) this.chatUnreadDot.classList.add('hidden');
        this._scrollToBottom(this.chatMessages);
      }
    }

    /** A move made on the board. */
    addMove(text) {
      this._appendLogEntry(text);
    }

    /** A note about the game itself (start, mill, timeout). */
    addSystemNote(text) {
      this._appendLogEntry(text, 'log-system');
    }

    /** A chat message from either player. */
    addChatMessage(msg) {
      const isMine = msg.sender === this.myName;

      const item = document.createElement('div');
      item.className = `chat-msg ${isMine ? 'chat-me' : 'chat-other'}`;
      const stone = `<span class="chat-stone chat-stone-${msg.color === 'W' ? 'w' : 'b'}" aria-hidden="true"></span>`;
      item.innerHTML = `
        <div class="chat-meta">${stone} <strong>${escapeHtml(msg.sender)}</strong></div>
        <div class="chat-bubble">${escapeHtml(msg.text)}</div>
      `;

      this.chatMessages.appendChild(item);
      this._scrollToBottom(this.chatMessages);

      // Phone layout: mark the hidden chat tab when the opponent writes.
      if (!isMine && this.chatUnreadDot && this._isTabbed() && this.activeTab !== 'chat') {
        this.chatUnreadDot.classList.remove('hidden');
      }
    }

    _appendLogEntry(text, className) {
      const entry = document.createElement('li');
      if (className) entry.className = className;
      entry.textContent = text;
      this.moveLogList.appendChild(entry);
      this._scrollToBottom(this.moveLogList);
    }

    _scrollToBottom(element) {
      element.scrollTop = element.scrollHeight;
    }

    /** True while the tab bar is on screen (phone-sized viewports). */
    _isTabbed() {
      const tabBar = document.querySelector('.dock-tabs');
      return !!tabBar && tabBar.offsetParent !== null;
    }
  }

  window.DockView = DockView;
})(window, document);
