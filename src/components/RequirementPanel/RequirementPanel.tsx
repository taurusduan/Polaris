/**
 * RequirementPanel - 需求队列主面板（占位组件）
 *
 * TODO: 步骤2 实现完整面板
 */

import { useTranslation } from 'react-i18next'

export function RequirementPanel() {
  const { t } = useTranslation('requirement')

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="text-text-primary text-sm font-medium">
        {t('title')}
      </h2>
      <p className="text-text-tertiary mt-2 text-xs">
        {t('empty.noRequirements')}
      </p>
    </div>
  )
}
