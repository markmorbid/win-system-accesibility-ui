
/*!
 * Toolskin UI Kit — vanilla JS components (no jQuery).
 * Namespace: window.ToolskinUIKit
 * Prefix: ts-ui-* (CSS), data-ts-ui-* (attributes)
 * Aliases: .ts-accordion ↔ .ts-ui-accordion; data-ts-accordion-* ↔ data-ts-ui-accordion-* (mirrored in JS)
 * Safe to inject alongside Toolskin core; does not modify native prototypes.
 */
(function (global) {
  'use strict';

  /** Firefox only: Mozilla scrollbar props disable ::-webkit-scrollbar in Chromium if applied to the same element */
  try {
    var _ua = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '';
    if (/Firefox\//i.test(_ua) || /\bFxiOS\b/i.test(_ua)) {
      document.documentElement.classList.add('ts-env-moz');
    }
  } catch (e) {}

    function sanitize(s) {
      const d = document.createElement('div');
      d.textContent = s == null ? '' : String(s);
      return d.innerHTML;
    }

    /** One capture-phase outside click + Escape for all selects (avoids per-instance bubble listeners broken by trigger stopPropagation). */
    let _tsUiSelectGlobalBound = false;
    function TSUISelectBindGlobalHandlers() {
      if (_tsUiSelectGlobalBound) return;
      _tsUiSelectGlobalBound = true;
      document.addEventListener(
        'click',
        function (e) {
          document.querySelectorAll('.ts-ui-select--open').forEach(function (w) {
            if (!w.contains(e.target) && typeof w.__tsUiSelectClose === 'function') {
              w.__tsUiSelectClose();
            }
          });
        },
        true
      );
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.ts-ui-select--open').forEach(function (w) {
          if (typeof w.__tsUiSelectClose === 'function') {
            w.__tsUiSelectClose();
            if (w.__tsUiSelectTrigger && typeof w.__tsUiSelectTrigger.focus === 'function') {
              w.__tsUiSelectTrigger.focus();
            }
          }
        });
      });
    }

/*ts tooltip component*/

/**
 * [data-tooltip] / [data-tooltip-func] hover layer — ported from YSS TooltipManager:
 * smart placement (top/bottom/left/right), collision avoidance, arrow, delays.
 * Position uses fixed + translate(); styling via --ts-tooltip-* on #ts-tooltip-container.
 */
class ToolskinTooltip {
  constructor(config) {
    this.config = config || {};
    this.el = null;
    this.arrowEl = null;
    this.contentEl = null;
    this.currentTarget = null;
    this.showTimeout = null;
    this.hideTimeout = null;
    this._hideClearTimer = null;
    this._onTooltipHideTransitionEnd = this._onTooltipHideTransitionEnd.bind(this);
    this.isVisible = false;
    this._positionRaf = null;

    this.CONFIG = {
      MAX_WIDTH: this.config.maxWidth != null ? this.config.maxWidth : 260,
      MIN_WIDTH: this.config.minWidth != null ? this.config.minWidth : 40,
      ARROW_SIZE: this.config.arrowSize != null ? this.config.arrowSize : 6,
      SPACING: this.config.spacing != null ? this.config.spacing : 8,
      PADDING: this.config.padding != null ? this.config.padding : 6,
      SHOW_DELAY: this.config.showDelay != null ? this.config.showDelay : 80,
      HIDE_DELAY: this.config.hideDelay != null ? this.config.hideDelay : 0,
      ANIM_MS: this.config.animMs != null ? this.config.animMs : 120,
    };

    this._handleMouseEnter = this._handleMouseEnter.bind(this);
    this._handleMouseLeave = this._handleMouseLeave.bind(this);
    this._handleFocus = this._handleFocus.bind(this);
    this._handleBlur = this._handleBlur.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._onScrollHide = this._onScrollHide.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onResize = this._onResize.bind(this);
    this._handleTooltipPointerEnter = this._handleTooltipPointerEnter.bind(this);
    this._handleTooltipPointerLeave = this._handleTooltipPointerLeave.bind(this);

    this._createDom();
    if (this.config.enabled) this._attach();
  }

  _handleTooltipPointerEnter() {
    this._clearHide();
  }

  _handleTooltipPointerLeave(e) {
    const to = e.relatedTarget;
    if (to && this.currentTarget && (this.currentTarget.contains(to) || (this.el && this.el.contains(to)))) {
      return;
    }
    this._clearShow();
    this._hide();
  }

  _scopes() {
    const s = this.config.scopeSelector || 'body';
    return String(s)
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);
  }

  _inScope(node) {
    if (!node || node.nodeType !== 1) return false;
    const scopes = this._scopes();
    if (!scopes.length) return true;
    return scopes.some(sel => {
      try {
        return !!node.closest(sel);
      } catch (e) {
        return false;
      }
    });
  }

  _attrName() {
    return this.config.attribute || 'data-tooltip';
  }

  _tooltipHost(target) {
    if (!target || !target.closest) return null;
    return target.closest(`[${this._attrName()}], [data-tooltip-func]`);
  }

  _getContent(target) {
    const funcName = target.dataset && target.dataset.tooltipFunc;
    if (funcName && typeof window[funcName] === 'function') {
      try {
        const result = window[funcName](target);
        if (result) return result;
      } catch (e) {
        console.error('ToolskinTooltip: data-tooltip-func error', e);
      }
    }
    const attr = this._attrName();
    const text =
      target.getAttribute(attr) || (target.dataset && target.dataset.tooltip) || '';
    return text && String(text).trim() ? String(text).trim() : null;
  }

  _createDom() {
    let el = document.getElementById('ts-tooltip-container');
    if (el) {
      this.el = el;
      this.contentEl = el.querySelector('#ts-tooltip-content') || el.querySelector('.ts-tooltip__content');
      this.arrowEl = el.querySelector('#ts-tooltip-arrow');
      if (!this.contentEl) {
        this.contentEl = document.createElement('div');
        this.contentEl.id = 'ts-tooltip-content';
        this.contentEl.className = 'ts-tooltip__content';
        el.insertBefore(this.contentEl, el.firstChild);
      }
      if (!this.arrowEl) {
        this.arrowEl = document.createElement('div');
        this.arrowEl.id = 'ts-tooltip-arrow';
        el.appendChild(this.arrowEl);
      }
      el.style.position = 'fixed';
      el.style.left = '0';
      el.style.top = '0';
      el.style.zIndex = String(this.config.zIndex != null ? this.config.zIndex : 100000);
      this._applyTooltipTokenVars(el);
      return;
    }
    el = document.createElement('div');
    el.id = 'ts-tooltip-container';
    el.className = 'ts-tooltip';
    el.style.position = 'fixed';
    el.style.left = '0';
    el.style.top = '0';
    el.setAttribute('role', 'tooltip');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    el.style.zIndex = String(this.config.zIndex != null ? this.config.zIndex : 100000);

    this.contentEl = document.createElement('div');
    this.contentEl.id = 'ts-tooltip-content';
    this.contentEl.className = 'ts-tooltip__content';

    this.arrowEl = document.createElement('div');
    this.arrowEl.id = 'ts-tooltip-arrow';

    el.append(this.contentEl, this.arrowEl);
    this.el = el;
    this._applyTooltipTokenVars(el);
    document.body.appendChild(el);
  }

  /** Maps CONFIG + Toolskin tokens to --ts-tooltip-* on the shell (mirrors YSS CSS variables). */
  _applyTooltipTokenVars(el) {
    if (!el) return;
    const a = this.CONFIG.ARROW_SIZE;
    el.style.setProperty('--ts-tooltip-arrow-size', `${a}px`);
    el.style.setProperty('--ts-tooltip-max-width', `${this.CONFIG.MAX_WIDTH}px`);
    el.style.setProperty('--ts-tooltip-min-width', `${this.CONFIG.MIN_WIDTH}px`);
    el.style.setProperty('--ts-tooltip-duration', `${this.CONFIG.ANIM_MS || 70}ms`);
  }

  _attach() {
    document.addEventListener('mouseover', this._handleMouseEnter, true);
    document.addEventListener('mouseout', this._handleMouseLeave, true);
    document.addEventListener('focusin', this._handleFocus, true);
    document.addEventListener('focusout', this._handleBlur, true);
    document.addEventListener('keydown', this._handleKeyDown);
    document.addEventListener('scroll', this._onScrollHide, true);
    document.addEventListener('mousedown', this._onMouseDown, true);
    window.addEventListener('resize', this._onResize, { passive: true });
    if (this.el) {
      this.el.addEventListener('mouseenter', this._handleTooltipPointerEnter);
      this.el.addEventListener('mouseleave', this._handleTooltipPointerLeave);
    }
  }

  _onResize() {
    if (!this.currentTarget || !this.isVisible) return;
    if (this._positionRaf) cancelAnimationFrame(this._positionRaf);
    this._positionRaf = requestAnimationFrame(() => {
      this._positionRaf = null;
      this._position(this.currentTarget);
    });
  }

  _onScrollHide() {
    this._clearShow();
    this._hide();
  }

  _onMouseDown(e) {
    if (this.el && !this.el.contains(e.target)) this._hide();
  }

  _clearShow() {
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }
  }

  _clearHide() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  _handleMouseEnter(e) {
    const target = this._tooltipHost(e.target);
    if (!target || !this._inScope(target)) return;
    const yss = target.closest('#yss-panel');
    if (yss && yss.getAttribute('data-mockup-tooltips') === 'off') return;

    const content = this._getContent(target);
    if (!content) return;

    // Immediately dismiss previous tooltip if target changed (prevents ghost lingering)
    if (this.currentTarget && this.currentTarget !== target && this.isVisible) {
      this._hide();
    }

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    if (this.showTimeout) clearTimeout(this.showTimeout);
    this.showTimeout = setTimeout(() => {
      this._show(target);
      this.showTimeout = null;
    }, this.CONFIG.SHOW_DELAY);
  }

  _handleMouseLeave(e) {
    // Always hide on mouseleave — don't try to be clever about relatedTarget.
    // The old logic checked if relatedTarget was inside the host, but this caused
    // sticky tooltips when events fired from nested children or recomposed DOM.
    if (!this.currentTarget) return;
    this._clearShow();
    // Immediate hide — no delay. Tooltip should disappear the instant the mouse leaves.
    this._hide();
  }

  _handleFocus(e) {
    const target = this._tooltipHost(e.target);
    if (!target || !this._inScope(target)) return;
    const yss = target.closest('#yss-panel');
    if (yss && yss.getAttribute('data-mockup-tooltips') === 'off') return;
    if (!this._getContent(target)) return;
    if (this.showTimeout) clearTimeout(this.showTimeout);
    this._show(target);
  }

  _handleBlur(e) {
    if (!this.currentTarget) return;
    const target = this._tooltipHost(e.target);
    if (target === this.currentTarget) {
      if (this.hideTimeout) clearTimeout(this.hideTimeout);
      this._hide();
    }
  }

  _handleKeyDown(e) {
    if (e.key === 'Escape' && this.isVisible) {
      const t = this.currentTarget;
      this._hide();
      if (t && t.focus) t.focus();
    }
  }

  _cancelHideCleanup() {
    if (this._hideClearTimer) {
      clearTimeout(this._hideClearTimer);
      this._hideClearTimer = null;
    }
    if (this.el) {
      this.el.removeEventListener('transitionend', this._onTooltipHideTransitionEnd);
    }
  }

  _finishHideCleanup() {
    // Do NOT clear transform, placement classes, or arrow position.
    // They persist harmlessly and are overwritten on next _show() → _position().
    // Clearing them causes FOUC: arrow flashes at wrong position before new placement is set.
  }

  _onTooltipHideTransitionEnd(e) {
    if (!this.el || e.target !== this.el) return;
    if (e.propertyName !== 'opacity') return;
    this.el.removeEventListener('transitionend', this._onTooltipHideTransitionEnd);
    if (this._hideClearTimer) {
      clearTimeout(this._hideClearTimer);
      this._hideClearTimer = null;
    }
    this._finishHideCleanup();
  }

  _show(target) {
    this._cancelHideCleanup();
    if (target === this.currentTarget && this.isVisible) return;

    const content = this._getContent(target);
    if (!content) {
      this._hide();
      return;
    }

    this.currentTarget = target;

    this.contentEl.textContent = '';
    if (typeof content === 'string') {
      this.contentEl.textContent = content;
    } else if (content && content.nodeType) {
      this.contentEl.appendChild(content);
    }

    this.el.style.maxWidth = `min(90vw, ${this.CONFIG.MAX_WIDTH}px)`;
    this.el.style.minWidth = `${this.CONFIG.MIN_WIDTH}px`;
    this.el.setAttribute(
      'aria-label',
      typeof content === 'string' ? content : (content.textContent || '').trim() || ''
    );

    this.el.classList.remove('ts-tooltip--visible');
    this._position(target);

    requestAnimationFrame(() => {
      // Safety: verify target is still in the document and mouse is still near it
      if (!this.currentTarget || !this.currentTarget.isConnected) {
        this._hide();
        return;
      }
      this.el.style.pointerEvents = 'none'; /* tooltips should never intercept clicks */
      this.el.classList.add('ts-tooltip--visible');
      this.isVisible = true;
    });
  }

  _hide() {
    this._clearShow();
    this._clearHide();
    this._cancelHideCleanup();
    if (!this.el) {
      this.currentTarget = null;
      this.isVisible = false;
      return;
    }
    this.el.style.pointerEvents = 'none';
    this.el.classList.remove('ts-tooltip--visible');
    this.el.removeAttribute('aria-label');
    this.currentTarget = null;
    this.isVisible = false;

    this.el.addEventListener('transitionend', this._onTooltipHideTransitionEnd);
    const ms = Math.max((this.CONFIG.ANIM_MS || 70) + 50, 150);
    this._hideClearTimer = setTimeout(() => {
      this._hideClearTimer = null;
      if (!this.el) return;
      this.el.removeEventListener('transitionend', this._onTooltipHideTransitionEnd);
      this._finishHideCleanup();
    }, ms);
  }

  _position(target) {
    // Get tooltip natural dimensions without moving it — use offsetWidth/Height
    // which don't depend on transform position
    const ttW = this.el.offsetWidth;
    const ttH = this.el.offsetHeight;
    const tRect = target.getBoundingClientRect();
    // Create a synthetic rect with just width/height (all _calculatePosition needs)
    const ttRect = { width: ttW, height: ttH, top: 0, left: 0, right: ttW, bottom: ttH };
    const obstacles = this._getInteractiveObstacles(target);

    const space = {
      top: tRect.top - this.CONFIG.PADDING,
      bottom: window.innerHeight - tRect.bottom - this.CONFIG.PADDING,
      left: tRect.left - this.CONFIG.PADDING,
      right: window.innerWidth - tRect.right - this.CONFIG.PADDING,
    };

    // Respect data-tooltip-pos if explicitly set (user override)
    const forcedPos = target.getAttribute('data-tooltip-pos');
    const placement = (forcedPos && /^(top|bottom|left|right)$/.test(forcedPos))
      ? forcedPos
      : this._findBestPlacement(tRect, ttRect, space, obstacles);
    let pos = this._calculatePosition(placement, tRect, ttRect);
    pos = this._avoidCollisions(pos, ttRect, obstacles);

    const finalX = Math.round(pos.x);
    const finalY = Math.round(pos.y);
    this.el.style.transform = `translate(${finalX}px, ${finalY}px)`;

    this.el.classList.remove('ts-placement-top', 'ts-placement-bottom', 'ts-placement-left', 'ts-placement-right');
    this.el.classList.add(`ts-placement-${placement}`);

    this._positionArrow(placement, tRect, pos, ttRect);
  }

  _getInteractiveObstacles(target) {
    const obstacles = [];
    const container = target.closest('.yss-button-with-dropdown, .ts-button-with-dropdown');
    if (!container) return obstacles;

    const dropdown = container.querySelector('.yss-button-options, .ts-button-options');
    if (dropdown) {
      const dropdownRect = dropdown.getBoundingClientRect();
      if (dropdownRect.width > 0 && dropdownRect.height > 0) {
        obstacles.push({ rect: dropdownRect, priority: 'high' });
      }
    }

    container.querySelectorAll('button, input, .yss-button-option-item, .ts-button-option-item').forEach(el => {
      if (el === target) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        obstacles.push({ rect, priority: 'medium' });
      }
    });

    return obstacles;
  }

  _findBestPlacement(tRect, ttRect, space, obstacles) {
    const placements = ['top', 'bottom', 'right', 'left'];
    const scores = {};

    for (const placement of placements) {
      const fits = this._placementFits(placement, space, ttRect);
      if (!fits) {
        scores[placement] = -1000;
        continue;
      }
      const pos = this._calculatePosition(placement, tRect, ttRect);
      const collisionPenalty = this._calculateCollisionPenalty(pos, ttRect, obstacles);
      const spaceScore = this._getSpaceScore(placement, space);
      scores[placement] = spaceScore - collisionPenalty;
    }

    // Bias toward vertical placements (more natural reading flow)
    if (scores.top > -1000) scores.top += 20;
    if (scores.bottom > -1000) scores.bottom += 15;

    let bestPlacement = 'top';
    let bestScore = scores.top;
    for (const p of placements) {
      if (scores[p] > bestScore) {
        bestScore = scores[p];
        bestPlacement = p;
      }
    }
    return bestPlacement;
  }

  _placementFits(placement, space, ttRect) {
    if (placement === 'top') return space.top >= ttRect.height + this.CONFIG.SPACING;
    if (placement === 'bottom') return space.bottom >= ttRect.height + this.CONFIG.SPACING;
    if (placement === 'left') return space.left >= ttRect.width + this.CONFIG.SPACING;
    if (placement === 'right') return space.right >= ttRect.width + this.CONFIG.SPACING;
    return false;
  }

  _getSpaceScore(placement, space) {
    if (placement === 'top') return space.top;
    if (placement === 'bottom') return space.bottom;
    if (placement === 'left') return space.left;
    if (placement === 'right') return space.right;
    return 0;
  }

  _calculateCollisionPenalty(pos, ttRect, obstacles) {
    let penalty = 0;
    const tooltipBounds = {
      left: pos.x,
      right: pos.x + ttRect.width,
      top: pos.y,
      bottom: pos.y + ttRect.height,
    };

    for (const obstacle of obstacles) {
      const overlap = this._calculateOverlap(tooltipBounds, obstacle.rect);
      if (overlap > 0) {
        const multiplier = obstacle.priority === 'high' ? 500 : 200;
        penalty += overlap * multiplier;
      }
    }
    return penalty;
  }

  _calculateOverlap(rect1, rect2) {
    const overlapX = Math.max(
      0,
      Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left)
    );
    const overlapY = Math.max(
      0,
      Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top)
    );
    return overlapX * overlapY;
  }

  _avoidCollisions(pos, ttRect, obstacles) {
    const adjustedPos = { ...pos };
    let tooltipBounds = {
      left: pos.x,
      right: pos.x + ttRect.width,
      top: pos.y,
      bottom: pos.y + ttRect.height,
    };

    for (const obstacle of obstacles) {
      const overlap = this._calculateOverlap(tooltipBounds, obstacle.rect);
      if (overlap > 0) {
        const shifts = {
          left: obstacle.rect.left - tooltipBounds.right - 5,
          right: obstacle.rect.right - tooltipBounds.left + 5,
          up: obstacle.rect.top - tooltipBounds.bottom - 5,
          down: obstacle.rect.bottom - tooltipBounds.top + 5,
        };

        const minShift = Object.entries(shifts).reduce(
          (min, [dir, val]) => (Math.abs(val) < Math.abs(min.val) ? { dir, val } : min),
          { dir: 'left', val: shifts.left }
        );

        if (minShift.dir === 'left' || minShift.dir === 'right') {
          adjustedPos.x += minShift.val;
        } else {
          adjustedPos.y += minShift.val;
        }

        tooltipBounds = {
          left: adjustedPos.x,
          right: adjustedPos.x + ttRect.width,
          top: adjustedPos.y,
          bottom: adjustedPos.y + ttRect.height,
        };
      }
    }

    const minX = this.CONFIG.PADDING;
    const maxX = window.innerWidth - this.CONFIG.PADDING - ttRect.width;
    const minY = this.CONFIG.PADDING;
    const maxY = window.innerHeight - this.CONFIG.PADDING - ttRect.height;

    adjustedPos.x = Math.max(minX, Math.min(maxX, adjustedPos.x));
    adjustedPos.y = Math.max(minY, Math.min(maxY, adjustedPos.y));

    return adjustedPos;
  }

  _calculatePosition(placement, tRect, ttRect) {
    const pos = { x: 0, y: 0 };
    const minX = this.CONFIG.PADDING;
    const maxX = window.innerWidth - this.CONFIG.PADDING - ttRect.width;
    const minY = this.CONFIG.PADDING;
    const maxY = window.innerHeight - this.CONFIG.PADDING - ttRect.height;

    const centerX = tRect.left + tRect.width / 2;
    const centerY = tRect.top + tRect.height / 2;

    if (placement === 'top' || placement === 'bottom') {
      pos.y =
        placement === 'top'
          ? tRect.top - ttRect.height - this.CONFIG.SPACING
          : tRect.bottom + this.CONFIG.SPACING;
      pos.y = Math.max(minY, Math.min(maxY, pos.y));
      pos.x = centerX - ttRect.width / 2;
      pos.x = Math.max(minX, Math.min(maxX, pos.x));
    } else {
      pos.x =
        placement === 'left'
          ? tRect.left - ttRect.width - this.CONFIG.SPACING
          : tRect.right + this.CONFIG.SPACING;
      pos.x = Math.max(minX, Math.min(maxX, pos.x));
      pos.y = centerY - ttRect.height / 2;
      pos.y = Math.max(minY, Math.min(maxY, pos.y));
    }

    return pos;
  }

  _positionArrow(placement, tRect, ttPos, ttRect) {
    if (!this.arrowEl) return;
    const centerX = tRect.left + tRect.width / 2;
    const centerY = tRect.top + tRect.height / 2;
    const arrow = this.CONFIG.ARROW_SIZE;

    if (placement === 'top' || placement === 'bottom') {
      let x = centerX - ttPos.x - arrow;
      x = Math.max(arrow, Math.min(ttRect.width - arrow * 3, x));
      this.arrowEl.style.left = `${Math.round(x)}px`;
      this.arrowEl.style.top = '';
    } else {
      let y = centerY - ttPos.y - arrow;
      y = Math.max(arrow, Math.min(ttRect.height - arrow * 3, y));
      this.arrowEl.style.top = `${Math.round(y)}px`;
      this.arrowEl.style.left = '';
    }
  }

  destroy() {
    document.removeEventListener('mouseover', this._handleMouseEnter, true);
    document.removeEventListener('mouseout', this._handleMouseLeave, true);
    document.removeEventListener('focusin', this._handleFocus, true);
    document.removeEventListener('focusout', this._handleBlur, true);
    document.removeEventListener('keydown', this._handleKeyDown);
    document.removeEventListener('scroll', this._onScrollHide, true);
    document.removeEventListener('mousedown', this._onMouseDown, true);
    window.removeEventListener('resize', this._onResize);
    if (this.el) {
      this.el.removeEventListener('mouseenter', this._handleTooltipPointerEnter);
      this.el.removeEventListener('mouseleave', this._handleTooltipPointerLeave);
    }
    this._hide();
    this._cancelHideCleanup();
    this._finishHideCleanup();
    if (this._hideClearTimer) {
      clearTimeout(this._hideClearTimer);
      this._hideClearTimer = null;
    }
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
    this.contentEl = null;
    this.arrowEl = null;
  }
}

/*ts accordsioin component*/


  function accordionIconHtml(ic) {
    if (!ic) return '';
    if (ic.indexOf('<') === 0) return ic;
    return '<i class="' + sanitize(ic) + '" aria-hidden="true"></i>';
  }

  /** Normalize optional alias class/attrs on accordion root */
  function TSUIAccordionNormalizeRoot(root) {
    if (!root || root.nodeType !== 1) return root;
    if (root.classList.contains('ts-accordion') && !root.classList.contains('ts-ui-accordion')) {
      root.classList.add('ts-ui-accordion');
    }
    if (root.hasAttribute('data-ts-accordion-multiple') && !root.hasAttribute('data-ts-ui-accordion-multiple')) {
      root.setAttribute('data-ts-ui-accordion-multiple', root.getAttribute('data-ts-accordion-multiple') || '');
    }
    if (root.getAttribute('data-ts-accordion-layout') === 'separated' && !root.classList.contains('ts-ui-accordion--separated')) {
      root.classList.add('ts-ui-accordion--separated');
    }
    if (root.getAttribute('data-ts-accordion-toggle') === 'plus' && !root.classList.contains('ts-ui-accordion--toggle-plus')) {
      root.classList.add('ts-ui-accordion--toggle-plus');
    }
    if (
      root.classList.contains('ts-ui-accordion--dual-icon') ||
      root.hasAttribute('data-ts-ui-accordion-dual-icon') ||
      root.getAttribute('data-ts-ui-accordion-dual-icon') === 'true' ||
      root.hasAttribute('data-ts-accordion-dual-icon') ||
      root.getAttribute('data-ts-accordion-dual-icon') === 'true'
    ) {
      root.classList.add('ts-ui-accordion--dual-icon');
    }
    root.querySelectorAll('.ts-accordion__item').forEach((el) => {
      if (!el.classList.contains('ts-ui-accordion__item')) el.classList.add('ts-ui-accordion__item');
    });
    root.querySelectorAll('.ts-accordion__header').forEach((el) => {
      if (!el.classList.contains('ts-ui-accordion__header')) el.classList.add('ts-ui-accordion__header');
    });
    root.querySelectorAll('.ts-accordion__panel').forEach((el) => {
      if (!el.classList.contains('ts-ui-accordion__panel')) el.classList.add('ts-ui-accordion__panel');
    });
    root.querySelectorAll('.ts-accordion__label').forEach((el) => {
      if (!el.classList.contains('ts-ui-accordion__label')) el.classList.add('ts-ui-accordion__label');
    });
    return root;
  }

  function TSUIAccordionEnhanceHeader(root, btn) {
    const item = btn.closest('.ts-ui-accordion__item');
    const dual = root.classList.contains('ts-ui-accordion--dual-icon');
    const togglePlus = root.classList.contains('ts-ui-accordion--toggle-plus');

    // ✅ PREVENT double enhancement
    if (btn.hasAttribute('data-ts-accordion-enhanced')) return;
    btn.setAttribute('data-ts-accordion-enhanced', 'true');

    // ✅ PRESERVE original label content before manipulation
    const existingLabel = btn.querySelector('.ts-ui-accordion__label');
    let labelText = '';
    if (existingLabel) {
      labelText = existingLabel.textContent.trim();
      // Remove existing label to prevent duplication
      existingLabel.remove();
    } else {
      // Extract text from button, excluding any existing icons
      labelText = Array.from(btn.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim())
        .join(' ') || btn.textContent.trim();
    }

    // ✅ CREATE or get header-main container
    let main = btn.querySelector('.ts-ui-accordion__header-main');
    if (!main) {
      main = document.createElement('span');
      main.className = 'ts-ui-accordion__header-main';

      // Clear existing content except indicators
      const indicator = btn.querySelector('.ts-ui-accordion__indicator');
      btn.innerHTML = '';
      btn.appendChild(main);
      if (indicator) btn.appendChild(indicator);
    }

    // ✅ ADD icon if specified (only if not already present)
    const ic = btn.getAttribute('data-icon');
    if (ic && !main.querySelector('.ts-ui-accordion__icon')) {
      const iconWrap = document.createElement('span');
      iconWrap.className = 'ts-ui-accordion__icon';
      iconWrap.setAttribute('aria-hidden', 'true');
      iconWrap.innerHTML = accordionIconHtml(ic);
      main.appendChild(iconWrap);
    }

    // ✅ ADD label with preserved text (only if not already present)
    if (labelText && !main.querySelector('.ts-ui-accordion__label')) {
      const label = document.createElement('span');
      label.className = 'ts-ui-accordion__label';
      label.textContent = labelText;
      main.appendChild(label);
    }

    if (togglePlus && !btn.querySelector('.ts-ui-accordion__indicator')) {
      const ind = document.createElement('span');
      ind.className = 'ts-ui-accordion__indicator';
      ind.setAttribute('aria-hidden', 'true');
      btn.appendChild(ind);
    }

    if (dual) {
      const catIc =
        (item && item.getAttribute('data-ts-ui-accordion-category-icon')) ||
        (item && item.getAttribute('data-ts-accordion-category-icon')) ||
        root.getAttribute('data-ts-ui-accordion-category-icon') ||
        root.getAttribute('data-ts-accordion-category-icon');
      if (catIc && !btn.querySelector('.ts-ui-accordion__category-icon')) {
        const catWrap = document.createElement('span');
        catWrap.className = 'ts-ui-accordion__category-icon ts-accordion__category-icon';
        catWrap.setAttribute('aria-hidden', 'true');
        catWrap.innerHTML = accordionIconHtml(catIc);
        /* ✅ REMOVED: separator creation - using border instead */
        btn.insertBefore(catWrap, main);
      }
    }
  }

  /* ── Accordion ─────────────────────────────────────────────────── */
  function TSUIAccordion(root) {
    if (!root || root.__tsUiAccordion) return;
    TSUIAccordionNormalizeRoot(root);
    root.__tsUiAccordion = true;
    const multi =
      root.hasAttribute('data-ts-ui-accordion-multiple') || root.hasAttribute('data-ts-accordion-multiple');
    const items = root.querySelectorAll('.ts-ui-accordion__item');

    items.forEach((item) => {
      const btn = item.querySelector('.ts-ui-accordion__header');
      const panel = item.querySelector('.ts-ui-accordion__panel');
      if (!btn || !panel) return;

      TSUIAccordionEnhanceHeader(root, btn);

      const open = () => {
        if (!multi) {
          items.forEach((other) => {
            if (other === item) return;
            const p = other.querySelector('.ts-ui-accordion__panel');
            const b = other.querySelector('.ts-ui-accordion__header');
            if (p) {
              p.hidden = true;
              p.classList.remove('ts-ui-accordion__panel--open');
            }
            if (b) {
              b.setAttribute('aria-expanded', 'false');
              b.classList.remove('ts-ui-accordion__header--active');
            }
          });
        }
        panel.hidden = false;
        panel.classList.add('ts-ui-accordion__panel--open');
        btn.setAttribute('aria-expanded', 'true');
        btn.classList.add('ts-ui-accordion__header--active');
        root.dispatchEvent(
          new CustomEvent('ts-ui:accordion-open', { bubbles: true, detail: { item } })
        );
      };

      const close = () => {
        panel.hidden = true;
        panel.classList.remove('ts-ui-accordion__panel--open');
        btn.setAttribute('aria-expanded', 'false');
        btn.classList.remove('ts-ui-accordion__header--active');
      };

      btn.addEventListener('click', () => {
        if (panel.hidden) open();
        else close();
      });

      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          btn.click();
        }
      });
    });
  }

  /**
   * Build accordion DOM from a schema object, then wire TSUIAccordion.
   * @param {HTMLElement} container Parent to append to (or null to create a detached div)
   * @param {{ multiple?: boolean, layout?: 'default'|'separated', toggle?: 'chevron'|'plus', dualIcon?: boolean, categoryIcon?: string, items: Array<{ title: string, html?: string, icon?: string, categoryIcon?: string, open?: boolean }> }} schema
   */
  function TSUIAccordionFromSchema(container, schema) {
    schema = schema || {};
    const root = document.createElement('div');
    root.className = 'ts-ui-accordion';
    if (schema.multiple) root.setAttribute('data-ts-ui-accordion-multiple', '');
    if (schema.layout === 'separated') root.classList.add('ts-ui-accordion--separated');
    if (schema.toggle === 'plus') root.classList.add('ts-ui-accordion--toggle-plus');
    if (schema.dualIcon) root.classList.add('ts-ui-accordion--dual-icon');
    if (schema.categoryIcon) root.setAttribute('data-ts-ui-accordion-category-icon', schema.categoryIcon);

    (schema.items || []).forEach((it, idx) => {
      const item = document.createElement('div');
      item.className = 'ts-ui-accordion__item';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ts-ui-accordion__header';
      btn.setAttribute('aria-expanded', it.open ? 'true' : 'false');
      if (it.open) btn.classList.add('ts-ui-accordion__header--active');
      if (it.icon) btn.setAttribute('data-icon', it.icon);
      if (it.categoryIcon) item.setAttribute('data-ts-ui-accordion-category-icon', it.categoryIcon);
      const main = document.createElement('span');
      main.className = 'ts-ui-accordion__header-main';
      const label = document.createElement('span');
      label.className = 'ts-ui-accordion__label';
      label.textContent = it.title != null ? String(it.title) : 'Section ' + (idx + 1);
      main.appendChild(label);
      btn.appendChild(main);
      if (schema.toggle === 'plus') {
        const ind = document.createElement('span');
        ind.className = 'ts-ui-accordion__indicator';
        ind.setAttribute('aria-hidden', 'true');
        btn.appendChild(ind);
      }
      const panel = document.createElement('div');
      panel.className = 'ts-ui-accordion__panel';
      if (it.html != null) {
        const wrap = document.createElement('div');
        wrap.innerHTML = String(it.html);
        while (wrap.firstChild) panel.appendChild(wrap.firstChild);
      }
      if (!it.open) panel.hidden = true;
      else panel.classList.add('ts-ui-accordion__panel--open');
      item.appendChild(btn);
      item.appendChild(panel);
      root.appendChild(item);
    });

    if (container) container.appendChild(root);
    TSUIAccordion(root);
    return root;
  }

    /* ── Card Accordion (ts-card-header.ts-accordion) ─────────────── */
  function TSUIAccordionCard(root) {
    var scope = root || document;

    // Global default: true = exclusive (single open); false = multiple
    var DEFAULT_EXCLUSIVE = true; // change to false to allow multiple by default

    scope.querySelectorAll('.ts-card-header.ts-accordion').forEach(function (hdr) {
      if (hdr.dataset.tsAccordionCardBound) return;
      hdr.dataset.tsAccordionCardBound = 'true';

      hdr.addEventListener('click', function (e) {
        // Toggle this header
        this.classList.toggle('open');

        // Determine exclusive mode for this pane
        var pane = this.closest('.ts-tab-pane');
        var modeAttr = pane ? pane.getAttribute('data-ts-accordion-mode') : null;
        var exclusive;
        if (modeAttr === 'multiple') exclusive = false;
        else if (modeAttr === 'single') exclusive = true;
        else exclusive = DEFAULT_EXCLUSIVE; // fallback to global

        if (exclusive) {
          var card = this.closest('.ts-card');
          if (!card) return;
          var container = pane || document;
          container.querySelectorAll('.ts-card').forEach(function (other) {
            if (other === card) return;
            var otherHeader = other.querySelector('.ts-card-header.ts-accordion');
            if (otherHeader) otherHeader.classList.remove('open');
          });
        }
      });
    });

    // Open first header in each pane if none open (only if exclusive mode)
    scope.querySelectorAll('.ts-tab-pane').forEach(function (pane) {
      var modeAttr = pane.getAttribute('data-ts-accordion-mode');
      var exclusive = (modeAttr === 'single') || (modeAttr !== 'multiple' && DEFAULT_EXCLUSIVE);
      if (!exclusive) return; // multiple mode: don't force open
      var hasOpen = pane.querySelector('.ts-card-header.ts-accordion.open');
      if (!hasOpen) {
        var first = pane.querySelector('.ts-card-header.ts-accordion');
        if (first) first.classList.add('open');
      }
    });
  }

    /* ── Global MutationObserver for dynamic components ───────────── */
  var _tsUiGlobalObserver = null;
  var _tsUiGlobalObserverDebounce = null;

  function TSUIEnsureGlobalObserver() {
    if (_tsUiGlobalObserver) return;
    _tsUiGlobalObserver = new MutationObserver(function () {
      // Debounce to avoid excessive calls
      if (_tsUiGlobalObserverDebounce) return;
      _tsUiGlobalObserverDebounce = requestAnimationFrame(function () {
        _tsUiGlobalObserverDebounce = null;
        // Re‑initialize all components on the whole document (idempotent)
        init(document);
      });
    });
    _tsUiGlobalObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
  /* ── Global MutationObserver for dynamic components ───────────── */
  var _tsUiGlobalObserver = null;
  var _tsUiGlobalObserverDebounce = null;

  function TSUIEnsureGlobalObserver() {
    if (_tsUiGlobalObserver) return;
    _tsUiGlobalObserver = new MutationObserver(function () {
      // Debounce to avoid excessive calls
      if (_tsUiGlobalObserverDebounce) return;
      _tsUiGlobalObserverDebounce = requestAnimationFrame(function () {
        _tsUiGlobalObserverDebounce = null;
        // Re‑initialize all components on the whole document (idempotent)
        init(document);
      });
    });
    _tsUiGlobalObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

   /* ── Custom select (native <select> enhancement) ───────────────── */
  function TSUISelect(wrap) {
    if (!wrap || wrap.__tsUiSelect) return;
    const native = wrap.querySelector('select.ts-ui-select__native, select');
    if (!native) return;
    wrap.__tsUiSelect = true;
    TSUISelectBindGlobalHandlers();

    const searchEnabled = wrap.getAttribute('data-ts-ui-select-search') !== 'false';

    native.classList.add('ts-ui-select__native');
    native.setAttribute('tabindex', '-1');
    native.setAttribute('aria-hidden', 'true');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ts-ui-select__trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'ts-ui-select__value';
    trigger.appendChild(label);

    const chev = document.createElement('span');
    chev.className = 'ts-ui-select__chevron';
    chev.setAttribute('aria-hidden', 'true');
    const chevIc = document.createElement('span');
    chevIc.className = 'ts-icon';
    chevIc.setAttribute('data-ts-icon', 'fa-solid fa-chevron-down');
    chev.appendChild(chevIc);
    trigger.appendChild(chev);

    const drop = document.createElement('div');
    drop.className = 'ts-ui-select__dropdown';
    drop.hidden = true;
    drop.setAttribute('role', 'listbox');

    const searchWrap = document.createElement('div');
    searchWrap.className = 'ts-ui-select__search';
    const searchIcon = document.createElement('span');
    searchIcon.className = 'ts-ui-select__search-icon';
    searchIcon.setAttribute('aria-hidden', 'true');
    const searchIc = document.createElement('span');
    searchIc.className = 'ts-icon';
    searchIc.setAttribute('data-ts-icon', 'fa-solid fa-magnifying-glass');
    searchIcon.appendChild(searchIc);
    const filter = document.createElement('input');
    filter.type = 'search';
    filter.className = 'ts-ui-select__filter';
    filter.placeholder = wrap.getAttribute('data-ts-ui-select-placeholder') || 'Search…';
    filter.setAttribute('aria-label', 'Filter options');
    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(filter);

    const list = document.createElement('ul');
    list.className = 'ts-ui-select__list';
    list.setAttribute('role', 'presentation');
    if (wrap.hasAttribute('data-ts-ui-scrollbar-moz') && document.documentElement.classList.contains('ts-env-moz')) {
      list.classList.add('ts-ui-scrollbar--moz');
      drop.classList.add('ts-ui-scrollbar--moz');
    }

    if (searchEnabled) {
      drop.appendChild(searchWrap);
    } else {
      searchWrap.hidden = true;
      wrap.classList.add('ts-ui-select--no-search');
    }
    drop.appendChild(list);

    native.insertAdjacentElement('afterend', trigger);
    trigger.insertAdjacentElement('afterend', drop);
    if (global.ToolskinIcons && typeof ToolskinIcons.inject === 'function') {
      ToolskinIcons.inject(wrap);
    }

    function iconHtml(opt) {
      const ic = opt.getAttribute('data-icon');
      if (!ic) return '';
      if (ic.indexOf('<') === 0) return ic;
      return '<i class="' + sanitize(ic) + '" aria-hidden="true"></i>';
    }

    function syncList() {
      list.innerHTML = '';
      const q = searchEnabled ? (filter.value || '').toLowerCase() : '';
      Array.from(native.options).forEach((opt, idx) => {
        if (opt.disabled) return;
        const t = (opt.textContent || '').toLowerCase();
        if (q && t.indexOf(q) === -1) return;
        const li = document.createElement('li');
        li.className = 'ts-ui-select__option';
        li.setAttribute('role', 'option');
        li.dataset.value = opt.value;
        li.dataset.index = String(idx);
        li.innerHTML =
          '<span class="ts-ui-select__option-inner">' +
          iconHtml(opt) +
          '<span class="ts-ui-select__option-text">' +
          sanitize(opt.textContent) +
          '</span></span>';
        if (opt.selected) li.classList.add('ts-ui-select__option--selected');
        li.addEventListener('click', () => {
          native.selectedIndex = idx;
          native.dispatchEvent(new Event('change', { bubbles: true }));
          updateTrigger();
          close();
        });
        list.appendChild(li);
      });
    }

    function updateTrigger() {
      const opt = native.options[native.selectedIndex];
      label.innerHTML =
        iconHtml(opt) + '<span class="ts-ui-select__value-text">' + sanitize(opt.textContent) + '</span>';
    }

    function closeOthers() {
      document.querySelectorAll('.ts-ui-select--open').forEach(function (w) {
        if (w !== wrap && typeof w.__tsUiSelectClose === 'function') {
          w.__tsUiSelectClose();
        }
      });
    }

    function open() {
      closeOthers();
      drop.hidden = false;
      drop.removeAttribute('hidden');
      trigger.setAttribute('aria-expanded', 'true');
      wrap.classList.add('ts-ui-select--open');
      syncList();
      if (searchEnabled) {
        filter.value = '';
        filter.focus();
      }
    }

    function close() {
      drop.hidden = true;
      drop.setAttribute('hidden', '');
      trigger.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('ts-ui-select--open');
    }

    wrap.__tsUiSelectClose = close;
    wrap.__tsUiSelectTrigger = trigger;

    trigger.addEventListener('click', () => {
      if (drop.hidden) open();
      else close();
    });

    if (searchEnabled) {
      filter.addEventListener('input', syncList);
    }

    native.addEventListener('change', updateTrigger);
    updateTrigger();
    syncList();
    close();
  }

  /* ── Draggable (pointer + optional parent bounds) ─────────────── */
  function getTranslate(el) {
    const st = el.style.transform;
    if (st && st.indexOf('translate') === 0) {
      const m = st.match(/translate\(([-0-9.]+)px,\s*([-0-9.]+)px\)/);
      if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    }
    return { x: 0, y: 0 };
  }

  function clampElInsideParent(el, parent, pad) {
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const p = pad || 0;
    let dx = 0;
    let dy = 0;
    if (er.left < pr.left + p) dx = pr.left + p - er.left;
    if (er.top < pr.top + p) dy = pr.top + p - er.top;
    if (er.right > pr.right - p) dx = pr.right - p - er.right;
    if (er.bottom > pr.bottom - p) dy = pr.bottom - p - er.bottom;
    if (dx === 0 && dy === 0) return;
    const t = getTranslate(el);
    el.style.transform = 'translate(' + (t.x + dx) + 'px,' + (t.y + dy) + 'px)';
  }

  /** Simple post-drag separation for sibling .ts-ui-draggable in the same parent. */
  function nudgeOutOfSiblings(el, parent, pad) {
    if (!parent) return;
    const p = pad || 0;
    const siblings = [...parent.children].filter(
      (n) => n !== el && n.classList && n.classList.contains('ts-ui-draggable')
    );
    for (let iter = 0; iter < 24; iter++) {
      let er = el.getBoundingClientRect();
      let hit = false;
      for (const sib of siblings) {
        const sr = sib.getBoundingClientRect();
        if (er.right <= sr.left + p || er.left >= sr.right - p || er.bottom <= sr.top + p || er.top >= sr.bottom - p) {
          continue;
        }
        hit = true;
        const t = getTranslate(el);
        const cx = (Math.min(er.right, sr.right) + Math.max(er.left, sr.left)) / 2;
        const sx = (sr.left + sr.right) / 2;
        const dx = cx < sx ? -Math.min(12, er.right - sr.left + p) : Math.min(12, sr.right - er.left + p);
        const cy = (Math.min(er.bottom, sr.bottom) + Math.max(er.top, sr.top)) / 2;
        const sy = (sr.top + sr.bottom) / 2;
        const dy = cy < sy ? -Math.min(12, er.bottom - sr.top + p) : Math.min(12, sr.bottom - er.top + p);
        el.style.transform = 'translate(' + (t.x + dx) + 'px,' + (t.y + dy) + 'px)';
        clampElInsideParent(el, parent, pad);
        break;
      }
      if (!hit) break;
    }
  }

  function TSUIDraggable(el, opts) {
    opts = opts || {};
    if (!el || el.__tsUiDraggable) return;
    el.__tsUiDraggable = true;
    const handle = opts.handle ? el.querySelector(opts.handle) : el;
    if (!handle) return;

    const boundsMode = el.getAttribute('data-ts-ui-draggable-bounds');
    const pad = parseFloat(el.getAttribute('data-ts-ui-draggable-padding') || '6') || 0;
    const parent = boundsMode === 'parent' ? el.parentElement : null;

    let pid = null;
    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;

    if (!el.style.position) el.style.position = 'relative';

    handle.style.touchAction = 'none';
    handle.style.cursor = 'grab';

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      pid = e.pointerId;
      handle.setPointerCapture(pid);
      sx = e.clientX;
      sy = e.clientY;
      const p = getTranslate(el);
      ox = p.x;
      oy = p.y;
      handle.style.cursor = 'grabbing';
      el.classList.add('ts-ui-draggable--dragging');

      function move(ev) {
        if (ev.pointerId !== pid) return;
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        el.style.transform = 'translate(' + (ox + dx) + 'px,' + (oy + dy) + 'px)';
        if (parent) clampElInsideParent(el, parent, pad);
        const t2 = getTranslate(el);
        ox = t2.x;
        oy = t2.y;
        sx = ev.clientX;
        sy = ev.clientY;
      }

      function up(ev) {
        if (ev.pointerId !== pid) return;
        try {
          handle.releasePointerCapture(pid);
        } catch (_) {}
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        handle.style.cursor = 'grab';
        el.classList.remove('ts-ui-draggable--dragging');
        let p2 = getTranslate(el);
        const overlapMode = el.getAttribute('data-ts-ui-draggable-overlap') || 'allow';
        if (overlapMode === 'avoid' && parent) {
          nudgeOutOfSiblings(el, parent, pad);
          p2 = getTranslate(el);
        }
        el.dispatchEvent(
          new CustomEvent('ts-ui:drag-end', { bubbles: true, detail: { x: p2.x, y: p2.y } })
        );
      }

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

/* ── Resizable (corner handle) ─────────────────────────────────── */
function TSUIResizable(el) {
  if (!el || el.__tsUiResizable) return;
  el.__tsUiResizable = true;
  const h = el.querySelector('.ts-ui-resizable__handle');
  if (!h) return;

  let pid = null;
  let sw = 0;
  let sh = 0;
  let sx = 0;
  let sy = 0;

  h.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pid = e.pointerId;
    h.setPointerCapture(pid);
    const r = el.getBoundingClientRect();
    sw = r.width;
    sh = r.height;
    sx = e.clientX;
    sy = e.clientY;
    el.classList.add('ts-ui-resizable--resizing');

    function move(ev) {
      if (ev.pointerId !== pid) return;
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      el.style.width = Math.max(120, sw + dx) + 'px';
      el.style.height = Math.max(80, sh + dy) + 'px';
    }

    function up(ev) {
      if (ev.pointerId !== pid) return;
      h.releasePointerCapture(pid);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.classList.remove('ts-ui-resizable--resizing');
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

/* ── Sortable list (pointer + ghost + FLIP displacement) ─ */
function TSUISortable(el) {
  if (!el || el.__tsUiSortable) return;
  el.__tsUiSortable = true;

  const handleOnly = el.hasAttribute('data-ts-ui-sort-handle-only');
  const handleSel  = el.getAttribute('data-ts-ui-sort-handle') || '.ts-ui-sortable__handle';
  const dragSel    = el.getAttribute('data-ts-ui-sort-drag');

  /* ── FLIP helper ──
     Snapshots every sibling's Y position before a DOM move,
     then applies an inverse translateY that the CSS transition
     animates back to 0 → smooth displacement. */
  function flipSnapshot(container, exclude) {
    const map = new Map();
    for (const child of container.children) {
      if (child === exclude) continue;
      map.set(child, child.getBoundingClientRect().top);
    }
    return map;
  }

  function flipAnimate(snapshot, container, exclude) {
    for (const [child, oldTop] of snapshot) {
      if (child === exclude || !child.isConnected) continue;
      const newTop = child.getBoundingClientRect().top;
      const delta  = oldTop - newTop;
      if (Math.abs(delta) < 1) continue;
      // Jump to old position, let CSS transition animate to 0
      child.style.transform = `translateY(${delta}px)`;
      // Force reflow so the browser registers the "from" position
      child.offsetHeight; // eslint-disable-line no-unused-expressions
      child.style.transform = '';
    }
  }

  el.querySelectorAll(':scope > .ts-ui-sortable__item').forEach((item) => {
    let dragHandle = item;
    if (dragSel) {
      dragHandle = item.querySelector(dragSel) || item;
    } else if (handleOnly) {
      dragHandle = item.querySelector(handleSel);
    }
    if (!dragHandle) return;

    dragHandle.addEventListener('pointerdown', (e) => {
      if (dragSel && !e.target.closest(dragSel)) return;
      if (handleOnly && !dragSel && !e.target.closest(handleSel)) return;
      if (e.button !== 0) return;
      e.preventDefault();

      const dragItem = item;
      let pid = e.pointerId;
      dragHandle.setPointerCapture(pid);

      const rect = dragItem.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      /* ── Sorting mode class: enables displacement transitions via CSS ── */
      el.classList.add('ts-ui-sortable--sorting');

      /* ── Placeholder ── */
      const placeholder = document.createElement('div');
      placeholder.className = 'ts-ui-sortable__placeholder';
      placeholder.style.height = rect.height + 'px';
      dragItem.parentNode.insertBefore(placeholder, dragItem);

      /* ── Ghost clone ── */
      const ghost = dragItem.cloneNode(true);
      if (ghost.id) ghost.removeAttribute('id');
      ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      ghost.classList.add('ts-ui-sortable__ghost');
      ghost.classList.remove('ts-ui-sortable__item--source');
      Object.assign(ghost.style, {
        position: 'fixed',
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: rect.width + 'px',
        margin: '0',
        zIndex: '100000',
        pointerEvents: 'none',
        boxSizing: 'border-box',
      });
      document.body.appendChild(ghost);

      /* ── Collapse source item (CSS handles the visual collapse via --source class) ── */
      dragItem.classList.add('ts-ui-sortable__item--source');

      /* ── Move placeholder with FLIP animation ── */
      function movePlaceholder(clientY) {
        const nodes = [...el.children].filter(
          (n) =>
            n !== dragItem &&
            (n.classList.contains('ts-ui-sortable__item') ||
             n.classList.contains('ts-ui-sortable__placeholder'))
        );

        // Find target position
        let target = null;
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          if (node === placeholder) continue;
          const r   = node.getBoundingClientRect();
          const mid = r.top + r.height / 2;
          if (clientY < mid) { target = node; break; }
        }

        // Skip if placeholder is already in the right spot
        const currentNext = placeholder.nextElementSibling;
        if (target === currentNext) return;
        if (!target && currentNext === null) return;

        // FLIP: snapshot → DOM move → animate
        const snap = flipSnapshot(el, dragItem);

        if (target) {
          el.insertBefore(placeholder, target);
        } else {
          el.appendChild(placeholder);
        }

        flipAnimate(snap, el, dragItem);
      }

      function move(ev) {
        if (ev.pointerId !== pid) return;
        ghost.style.left = ev.clientX - offsetX + 'px';
        ghost.style.top  = ev.clientY - offsetY + 'px';
        movePlaceholder(ev.clientY);
      }

      function up(ev) {
        if (ev.pointerId !== pid) return;
        try { dragHandle.releasePointerCapture(pid); } catch (_) {}
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);

        ghost.remove();

        if (placeholder && placeholder.parentNode) {
          placeholder.parentNode.insertBefore(dragItem, placeholder);
          placeholder.remove();
        }

        dragItem.classList.remove('ts-ui-sortable__item--source');
        el.classList.remove('ts-ui-sortable--sorting');

        // Clean up any lingering transforms from FLIP
        for (const child of el.children) {
          child.style.transform = '';
        }

        el.dispatchEvent(new CustomEvent('ts-ui:sort-end', { bubbles: true }));
      }

      move(e);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  });
}

  /* ── Table: bulk row selection + floating bar ─────────────────── */
  function TSUITableBulk(wrap) {
    if (!wrap || wrap.__tsUiTableBulk) return;
    const table = wrap.querySelector('table.ts-ui-table--bulk');
    if (!table) return;
    wrap.__tsUiTableBulk = true;

    const bar = wrap.querySelector('.ts-ui-bulk-bar');
    const countEl = bar && bar.querySelector('.ts-ui-bulk-bar__count');
    const selectAll = table.querySelector('thead .ts-ui-table__select-all');

    function rowCheckboxes() {
      return table.querySelectorAll('tbody .ts-ui-row-checkbox');
    }

    function update() {
      const checks = rowCheckboxes();
      let n = 0;
      checks.forEach((c) => {
        const tr = c.closest('tr');
        if (!tr) return;
        if (c.checked) {
          tr.classList.add('ts-ui-row--selected');
          n++;
        } else {
          tr.classList.remove('ts-ui-row--selected');
        }
      });
      if (bar) {
        bar.hidden = n === 0;
        bar.style.display = n === 0 ? 'none' : '';
      }
      if (countEl) countEl.textContent = n + ' selected';
      if (selectAll) {
        const total = checks.length;
        selectAll.indeterminate = n > 0 && n < total;
        selectAll.checked = total > 0 && n === total;
      }
    }

    table.addEventListener('change', (e) => {
      const t = e.target;
      if (!t || !(t instanceof HTMLInputElement)) return;
      if (t.classList.contains('ts-ui-table__select-all')) {
        const on = t.checked;
        rowCheckboxes().forEach((c) => {
          c.checked = on;
        });
        update();
        return;
      }
      if (t.classList.contains('ts-ui-row-checkbox')) {
        update();
      }
    });

    update();
  }

  /* ── Enhanced toast (parallel to ToolskinToast, richer styling) ─ */
  const TSUIToast = {
    _container: null,
    getContainer() {
      if (!this._container) {
        this._container = document.createElement('div');
        this._container.className = 'ts-ui-toast-stack';
        document.body.appendChild(this._container);
      }
      return this._container;
    },
    show(message, opts) {
      opts = opts || {};
      const type = opts.type || 'default';
      const duration = opts.duration != null ? opts.duration : 4500;
      const title = opts.title || '';
      const icons = {
        success: 'fa-solid fa-circle-check',
        warning: 'fa-solid fa-triangle-exclamation',
        error: 'fa-solid fa-circle-xmark',
        info: 'fa-solid fa-circle-info',
        default: 'fa-solid fa-bell',
      };
      const icon = opts.icon || icons[type] || icons.default;

      const el = document.createElement('div');
      el.className = 'ts-ui-toast ts-ui-toast--' + type;
      el.setAttribute('role', 'status');
      el.innerHTML =
        '<div class="ts-ui-toast__track"></div>' +
        '<div class="ts-ui-toast__row">' +
        '<span class="ts-ui-toast__icon"><i class="' +
        sanitize(icon) +
        '"></i></span>' +
        '<div class="ts-ui-toast__body">' +
        (title ? '<div class="ts-ui-toast__title">' + sanitize(title) + '</div>' : '') +
        '<div class="ts-ui-toast__msg">' +
        sanitize(message) +
        '</div></div>' +
        '<button type="button" class="ts-ui-toast__close" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button></div>';

      const track = el.querySelector('.ts-ui-toast__track');
      const close = () => {
        el.classList.add('ts-ui-toast--out');
        setTimeout(() => el.remove(), 280);
      };
      el.querySelector('.ts-ui-toast__close').addEventListener('click', close);
      this.getContainer().appendChild(el);

      if (duration > 0 && track) {
        track.style.transition = 'transform ' + duration + 'ms linear';
        requestAnimationFrame(() => {
          track.classList.add('ts-ui-toast__track--animate');
        });
        setTimeout(close, duration);
      }
      return el;
    },
  };

  /* ── Table sort (data-sort-key + data-value, or legacy data-ts-ui-sort) ─ */
  function TSUITableSort(table) {
    if (!table || table.__tsUiTableSort) return;
    table.__tsUiTableSort = true;
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;

    const keyHeaders = [...thead.querySelectorAll('th[data-sort-key]')];
    const legacyMode = keyHeaders.length === 0;

    function compareCells(aCell, bCell, reverse) {
      if (!aCell || !bCell) return 0;
      const aText =
        aCell.dataset.value != null && aCell.dataset.value !== '' ? aCell.dataset.value : aCell.textContent.trim();
      const bText =
        bCell.dataset.value != null && bCell.dataset.value !== '' ? bCell.dataset.value : bCell.textContent.trim();
      const aNum = parseFloat(aText);
      const bNum = parseFloat(bText);
      let comparison = 0;
      if (!isNaN(aNum) && !isNaN(bNum)) {
        comparison = aNum - bNum;
      } else {
        comparison = String(aText).localeCompare(String(bText), undefined, {
          sensitivity: 'base',
          numeric: true,
        });
      }
      return reverse ? -comparison : comparison;
    }

    if (!legacyMode) {
      keyHeaders.forEach((th) => {
        th.style.cursor = 'pointer';
        th.classList.add('ts-ui-th--sortable');
        th.addEventListener('click', () => {
          const columnKey = th.dataset.sortKey;
          const isReversed =
            th.classList.contains('ts-ui-th--active') && !th.classList.contains('ts-ui-th--reverse');
          keyHeaders.forEach((h) => {
            h.classList.remove('ts-ui-th--active', 'ts-ui-th--reverse');
            if (h.dataset.sortKey === columnKey) {
              h.classList.add('ts-ui-th--active');
              if (isReversed) h.classList.add('ts-ui-th--reverse');
            }
          });
          const columnIndex = [...th.parentNode.children].indexOf(th);
          if (columnIndex === -1) return;
          const rows = [...tbody.querySelectorAll('tr')];
          rows.sort((a, b) => {
            const aCell = a.children[columnIndex];
            const bCell = b.children[columnIndex];
            return compareCells(aCell, bCell, isReversed);
          });
          tbody.append(...rows);
        });
      });
      return;
    }

    const ths = table.querySelectorAll('thead th[data-ts-ui-sort]');
    ths.forEach((th) => {
      th.style.cursor = 'pointer';
      th.classList.add('ts-ui-th--sortable');
      th.addEventListener('click', () => {
        const col = parseInt(th.getAttribute('data-ts-ui-sort'), 10) || 0;
        const asc = th.classList.toggle('ts-ui-th--sort-asc');
        th.classList.toggle('ts-ui-th--sort-desc', !asc);
        ths.forEach((h) => {
          if (h !== th) h.classList.remove('ts-ui-th--sort-asc', 'ts-ui-th--sort-desc');
        });
        const rows = [...tbody.querySelectorAll('tr')];
        rows.sort((a, b) => compareCells(a.cells[col], b.cells[col], !asc));
        tbody.append(...rows);
      });
    });
  }


  /* ── Auto-enhance standalone <input type="number"> (YSS-style chevrons) ─ */
  function TSUIEnhanceNumberInput(input) {
    if (!input || !(input instanceof HTMLInputElement) || input.type !== 'number') {
      return input;
    }
    if (input.closest('.ts-ui-spinner') || input.closest('.ts-ui-number-input-wrapper')) {
      return input.parentElement || input;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'ts-ui-number-input-wrapper';
    if (input.parentNode) input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const controls = document.createElement('div');
    controls.className = 'ts-ui-number-input-controls';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'ts-ui-number-btn';
    upBtn.setAttribute('aria-label', 'Increment');
    upBtn.innerHTML = '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i>';
    upBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.stepUp();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'ts-ui-number-btn';
    downBtn.setAttribute('aria-label', 'Decrement');
    downBtn.innerHTML = '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
    downBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.stepDown();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    controls.appendChild(upBtn);
    controls.appendChild(downBtn);
    wrapper.appendChild(controls);
    return wrapper;
  }

  const _enhancedNumberInputs = new WeakSet();
  let _numberInputObserver = null;

  function TSUIEnhanceNumberInputsIn(root) {
    const scope = root || document;
    scope.querySelectorAll('input[type="number"]:not(.ts-ui-number-input-wrapper input)').forEach((input) => {
      if (input.closest('.ts-ui-spinner')) return;
      if (_enhancedNumberInputs.has(input)) return;
      try {
        TSUIEnhanceNumberInput(input);
        _enhancedNumberInputs.add(input);
      } catch (e) {
        console.warn('ToolskinUIKit: number input enhance failed', e);
      }
    });
  }

  function TSUIEnsureNumberInputObserver() {
    if (_numberInputObserver) return;
    const target = document.body;
    if (!target) return;
    _numberInputObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node instanceof HTMLInputElement && node.type === 'number') {
            if (!node.closest('.ts-ui-spinner') && !_enhancedNumberInputs.has(node)) {
              try {
                TSUIEnhanceNumberInput(node);
                _enhancedNumberInputs.add(node);
              } catch (_) {}
            }
          }
          if (node.querySelectorAll) {
            node
              .querySelectorAll('input[type="number"]:not(.ts-ui-number-input-wrapper input)')
              .forEach((input) => {
                if (input.closest('.ts-ui-spinner') || _enhancedNumberInputs.has(input)) return;
                try {
                  TSUIEnhanceNumberInput(input);
                  _enhancedNumberInputs.add(input);
                } catch (_) {}
              });
          }
        });
      });
    });
    _numberInputObserver.observe(target, { childList: true, subtree: true });
  }


}
/* ── Public API ────────────────────────────────────────────────── */
function init(scope) {
  var root = scope || document;
  
  root.querySelectorAll('.ts-ui-accordion, .ts-accordion').forEach(TSUIAccordion);


  TSUIAccordionCard(root);

  TSUIEnsureGlobalObserver();

}

 global.ToolskinUIKit = {
  init: init,
  Accordion: TSUIAccordion,
  AccordionFromSchema: TSUIAccordionFromSchema,
    AccordionCard: TSUIAccordionCard,

};
