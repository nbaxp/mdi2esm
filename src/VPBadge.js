import styleMixin from 'vue-style-runtime';

const BADGE_CSS = `
.VPBadge {
  display: inline-block;
  margin-inline-start: 0.125rem;
  border: 1px solid transparent;
  border-radius: 0.75rem;
  padding: 0 0.625rem;
  line-height: 1.8333333;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  transform: translateY(-0.125rem);
}

.VPBadge.small {
  padding: 0 0.375rem;
  line-height: 1.8;
  font-size: 0.625rem;
  transform: translateY(-0.5rem);
}

.VPDocFooter .VPBadge {
  display: none;
}

.vp-doc h1 > .VPBadge,
.vp-doc h2 > .VPBadge {
  margin: 0;
  margin-inline-start: 0.125rem;
  vertical-align: middle;
}

.vp-doc h2 > .VPBadge {
  padding: 0 0.5rem;
}

.vp-doc h3 > .VPBadge {
  vertical-align: middle;
}

.vp-doc h4 > .VPBadge,
.vp-doc h5 > .VPBadge,
.vp-doc h6 > .VPBadge {
  vertical-align: middle;
  line-height: 1.5;
}

.VPBadge.info {
  border-color: var(--vp-badge-info-border);
  color: var(--vp-badge-info-text);
  background-color: var(--vp-badge-info-bg);
}

.VPBadge.note {
  border-color: var(--vp-badge-note-border);
  color: var(--vp-badge-note-text);
  background-color: var(--vp-badge-note-bg);
}

.VPBadge.tip {
  border-color: var(--vp-badge-tip-border);
  color: var(--vp-badge-tip-text);
  background-color: var(--vp-badge-tip-bg);
}

.VPBadge.important {
  border-color: var(--vp-badge-important-border);
  color: var(--vp-badge-important-text);
  background-color: var(--vp-badge-important-bg);
}

.VPBadge.caution {
  border-color: var(--vp-badge-caution-border);
  color: var(--vp-badge-caution-text);
  background-color: var(--vp-badge-caution-bg);
}

.VPBadge.warning {
  border-color: var(--vp-badge-warning-border);
  color: var(--vp-badge-warning-text);
  background-color: var(--vp-badge-warning-bg);
}

.VPBadge.danger {
  border-color: var(--vp-badge-danger-border);
  color: var(--vp-badge-danger-text);
  background-color: var(--vp-badge-danger-bg);
}
`;

// 1:1 移植 VitePress VPBadge.vue；Markdown 里的 <Badge> 由动态组件注册为 Badge，
// 原版：https://github.com/vuejs/vitepress/blob/v2.0.0-alpha.21/src/client/theme-default/components/VPBadge.vue
// badgeStyles 供入口按需全局注入一次，保证徽标在页面模板里也有样式。
const VPBadge = {
  mixins: [styleMixin],
  props: {
    text: { type: String, required: false },
    type: { type: String, required: false, default: 'tip' },
  },
  template: /* HTML */ `
    <span class="VPBadge" :class="type" dir="auto">
      <slot>{{ text }}</slot>
    </span>
  `,
  styles: /* HTML */ `<style scoped>
    ${BADGE_CSS}
  </style>`,
};

const badgeStyles = BADGE_CSS;

export { badgeStyles };
export default VPBadge;
