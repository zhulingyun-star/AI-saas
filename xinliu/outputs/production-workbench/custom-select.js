'use strict';

const customSelectInstances = new Set();
let activeCustomSelect = null;

class CustomSelect {
  constructor({ select, container, label, options, value, onChange }) {
    this.select = select || document.createElement('select');
    this.onChange = onChange;
    this.label = label;
    this.expanded = false;
    this.index = 0;
    this.search = '';
    this.searchAt = 0;
    this.root = document.createElement('div');
    this.root.className = 'custom-select';
    this.root.customSelect = this;
    this.select.customSelect = this;
    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.className = 'input custom-select-trigger';
    this.trigger.setAttribute('role', 'combobox');
    this.trigger.setAttribute('aria-haspopup', 'listbox');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.list = document.createElement('div');
    this.list.className = 'custom-select-list';
    this.list.id = uniqueId('select-list');
    this.list.setAttribute('role', 'listbox');
    this.trigger.setAttribute('aria-controls', this.list.id);
    this.list.hidden = true;
    this.error = document.createElement('span');
    this.error.className = 'custom-select-error';
    this.error.id = uniqueId('select-error');
    this.error.hidden = true;
    if (options) this.select.replaceChildren(...options.map(item => {
      const option = new Option(item.label, item.value);
      option.disabled = item.disabled === true;
      return option;
    }));
    if (value !== undefined) this.select.value = value;
    this.originalTabIndex = this.select.getAttribute('tabindex');
    this.originalAriaHidden = this.select.getAttribute('aria-hidden');
    this.select.classList.add('custom-select-native');
    this.select.tabIndex = -1;
    this.select.setAttribute('aria-hidden', 'true');
    this.root.append(this.trigger, this.list, this.error);
    if (select) select.after(this.root);
    else { container.append(this.select, this.root); }
    this.trigger.onclick = () => this.toggle();
    this.root.onkeydown = event => this.keydown(event);
    this.list.onkeydown = event => this.keydown(event);
    this.change = () => {
      this.error.hidden = true;
      this.error.removeAttribute('role');
      this.error.textContent = '';
      this.trigger.removeAttribute('aria-invalid');
      this.trigger.removeAttribute('aria-describedby');
      this.refresh();
    };
    this.invalid = event => {
      event.preventDefault();
      this.error.textContent = this.select.validationMessage;
      this.error.setAttribute('role', 'alert');
      this.error.hidden = false;
      this.trigger.setAttribute('aria-invalid', 'true');
      this.trigger.setAttribute('aria-describedby', this.error.id);
      this.trigger.focus();
    };
    this.focus = () => this.trigger.focus();
    this.click = event => { event.preventDefault(); this.toggle(true); };
    this.select.addEventListener('change', this.change);
    this.select.addEventListener('invalid', this.invalid);
    this.select.addEventListener('focus', this.focus);
    this.select.addEventListener('click', this.click);
    this.observer = new MutationObserver(() => this.refresh());
    this.observer.observe(this.select, { attributes: true, childList: true, characterData: true, subtree: true });
    customSelectInstances.add(this);
    this.refresh();
  }
  name() {
    if (this.label || this.select.getAttribute('aria-label')) return this.label || this.select.getAttribute('aria-label');
    const labelled = this.select.getAttribute('aria-labelledby');
    if (labelled) return labelled.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
    const label = this.select.labels?.[0];
    return label?.querySelector(':scope>span')?.textContent.trim() || (label ? [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(' ').trim() : '') || this.select.title || '选择';
  }
  disabled(option) { return !option || option.disabled || option.parentElement?.disabled === true; }
  refresh() {
    const focused = this.expanded && this.list.contains(document.activeElement);
    const previousIndex = this.index;
    this.trigger.setAttribute('aria-label', this.name());
    this.list.setAttribute('aria-label', this.name());
    this.trigger.textContent = this.select.selectedOptions[0]?.textContent || '未选择';
    this.trigger.disabled = this.select.matches(':disabled');
    this.trigger.setAttribute('aria-required', String(this.select.required));
    this.root.hidden = this.select.hidden;
    this.list.replaceChildren(...[...this.select.options].map((option, index) => {
      const buttonElement = document.createElement('button');
      buttonElement.type = 'button';
      buttonElement.id = this.list.id + '-option-' + index;
      buttonElement.textContent = option.textContent;
      buttonElement.setAttribute('role', 'option');
      buttonElement.setAttribute('aria-selected', String(option.selected));
      buttonElement.disabled = this.disabled(option);
      buttonElement.hidden = option.hidden;
      buttonElement.tabIndex = -1;
      buttonElement.onclick = () => this.choose(index);
      buttonElement.onfocus = () => {
        this.index = index;
        this.trigger.setAttribute('aria-activedescendant', buttonElement.id);
      };
      return buttonElement;
    }));
    this.index = focused ? Math.min(previousIndex, this.select.options.length - 1) : Math.max(0, this.select.selectedIndex);
    if (this.expanded && (this.trigger.disabled || !this.root.isConnected || this.root.hidden)) this.toggle(false);
    else if (this.expanded) {
      this.place();
      if (focused) this.focusOption(this.index);
    }
  }
  focusOption(index) {
    const option = this.select.options[index];
    if (this.disabled(option) || option.hidden) return;
    this.index = index;
    this.list.children[index]?.focus({ preventScroll: true });
    this.list.children[index]?.scrollIntoView({ block: 'nearest' });
  }
  place() {
    if (!this.expanded) return;
    const rect = this.trigger.getBoundingClientRect();
    if (!this.root.isConnected || !rect.height || rect.bottom < 0 || rect.top > innerHeight) { this.toggle(false); return; }
    const margin = 8;
    const below = innerHeight - rect.bottom - margin - 4;
    const above = rect.top - margin - 4;
    const upward = below < 180 && above > below;
    const height = Math.max(40, Math.min(264, upward ? above : below));
    const width = Math.min(Math.max(rect.width, 160), innerWidth - margin * 2);
    Object.assign(this.list.style, { width: width + 'px', left: Math.max(margin, Math.min(rect.left, innerWidth - width - margin)) + 'px', maxHeight: height + 'px', top: upward ? 'auto' : rect.bottom + 4 + 'px', bottom: upward ? innerHeight - rect.top + 4 + 'px' : 'auto' });
  }
  toggle(open = !this.expanded) {
    this.trigger.disabled = this.select.matches(':disabled');
    if (open && this.trigger.disabled) return;
    if (open && activeCustomSelect && activeCustomSelect !== this) activeCustomSelect.toggle(false);
    this.expanded = open;
    this.trigger.setAttribute('aria-expanded', String(open));
    this.list.hidden = !open;
    if (open) {
      activeCustomSelect = this;
      this.refresh();
      const parent = this.root.closest('[role="dialog"]') || document.body;
      parent.append(this.list);
      this.place();
      const enabled = [...this.select.options].findIndex(option => !this.disabled(option) && !option.hidden);
      this.focusOption(this.disabled(this.select.options[this.index]) || this.select.options[this.index]?.hidden ? enabled : this.index);
    } else {
      if (activeCustomSelect === this) activeCustomSelect = null;
      this.trigger.removeAttribute('aria-activedescendant');
      this.root.append(this.list);
      this.list.removeAttribute('style');
    }
  }
  choose(index) {
    const option = this.select.options[index];
    if (this.disabled(option) || option.hidden || this.select.matches(':disabled')) return;
    this.select.value = option.value;
    this.toggle(false);
    this.trigger.focus();
    this.change();
    if (this.onChange) this.onChange(option.value);
    else {
      this.select.dispatchEvent(new Event('input', { bubbles: true }));
      this.select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (this.select.id && !this.select.isConnected) document.getElementById(this.select.id)?.customSelect?.trigger.focus({ preventScroll: true });
  }
  keydown(event) {
    if (event.key === 'Escape' && this.expanded) { event.preventDefault(); event.stopPropagation(); this.toggle(false); this.trigger.focus(); return; }
    if (event.key === 'Tab' && this.expanded) { this.toggle(false); this.trigger.focus(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!this.expanded) {
        this.toggle(true);
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      }
      const options = [...this.select.options];
      let next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : this.index + (event.key === 'ArrowDown' ? 1 : -1);
      next = Math.max(0, Math.min(options.length - 1, next));
      while (options[next] && (this.disabled(options[next]) || options[next].hidden)) next += ['ArrowUp', 'End'].includes(event.key) ? -1 : 1;
      this.focusOption(next);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && this.expanded) { event.preventDefault(); this.choose(this.index); return; }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
      event.preventDefault();
      this.search = Date.now() - this.searchAt > 800 ? event.key : this.search + event.key;
      this.searchAt = Date.now();
      if (!this.expanded) this.toggle(true);
      const index = [...this.select.options].findIndex(option => !this.disabled(option) && !option.hidden && option.textContent.trim().toLocaleLowerCase().startsWith(this.search.toLocaleLowerCase()));
      if (index >= 0) this.focusOption(index);
    }
  }
  destroy() {
    this.toggle(false);
    this.observer.disconnect();
    this.select.removeEventListener('change', this.change);
    this.select.removeEventListener('invalid', this.invalid);
    this.select.removeEventListener('focus', this.focus);
    this.select.removeEventListener('click', this.click);
    this.select.classList.remove('custom-select-native');
    if (this.originalTabIndex == null) this.select.removeAttribute('tabindex'); else this.select.setAttribute('tabindex', this.originalTabIndex);
    if (this.originalAriaHidden == null) this.select.removeAttribute('aria-hidden'); else this.select.setAttribute('aria-hidden', this.originalAriaHidden);
    this.root.remove();
    delete this.select.customSelect;
    customSelectInstances.delete(this);
  }
}
document.addEventListener('click', event => {
  const component = activeCustomSelect;
  if (component && !component.root.contains(event.target) && !component.list.contains(event.target) && event.target !== component.select) component.toggle(false);
});
function enhanceSelect(select) {
  if (!select || select.multiple || select.size > 1) return;
  if (select.customSelect?.root.isConnected) return;
  select.customSelect?.destroy();
  return new CustomSelect({ select });
}
function enhanceSelects(scope = document) {
  for (const component of customSelectInstances) if (!component.select.isConnected || !component.root.isConnected) component.destroy();
  if (scope.matches?.('select')) enhanceSelect(scope);
  scope.querySelectorAll('select').forEach(enhanceSelect);
}
new MutationObserver(records => {
  records.filter(record => record.type === 'attributes' && record.target.matches('fieldset')).forEach(record => record.target.querySelectorAll('select').forEach(select => select.customSelect?.refresh()));
  if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE))) enhanceSelects();
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
document.addEventListener('reset', event => requestAnimationFrame(() => event.target.querySelectorAll('select').forEach(select => select.customSelect?.change())));
window.addEventListener('resize', () => activeCustomSelect?.place());
document.addEventListener('scroll', event => {
  if (activeCustomSelect && !activeCustomSelect.list.contains(event.target)) activeCustomSelect.place();
}, true);
