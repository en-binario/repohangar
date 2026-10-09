// The batch result panel above the grid (batch-operations: Batch result panel, Fix buttons, Retry failed; W8): one
// line per repository with its fix buttons, Retry failed and Close.

import { FIX_LABELS, type BatchPanel, type FixId } from '../src/shared/batchResult';

interface Props {
  panel: BatchPanel;
  onFix(id: string, fix: FixId): void;
  onRetry(): void;
  onCopyLinks(): void;
  onClose(): void;
}

export function BatchResult({ panel, onFix, onRetry, onCopyLinks, onClose }: Props) {
  return (
    <div class="batch-result" role="region" aria-label={panel.title} data-batch-result={panel.kind}>
      <div class="batch-result-head">
        <span class="batch-result-title">{panel.title}</span>
        <span class="batch-result-counts">{panel.counts}</span>
      </div>
      <ul class="batch-result-lines">
        {panel.lines.map((line) => (
          <li key={line.id} class="batch-result-line" data-result-repo={line.name} data-state={line.state} aria-busy={line.running ?? false}>
            <span class="batch-result-text">{line.text}</span>
            {line.fixes.map((fix) => (
              <button type="button" key={fix} class="fix" data-fix={fix} disabled={line.running} onClick={() => onFix(line.id, fix)}>
                {FIX_LABELS[fix]}
              </button>
            ))}
          </li>
        ))}
      </ul>
      {panel.note && <p class="batch-result-note">{panel.note}</p>}
      <div class="batch-result-buttons">
        {panel.links && (
          <button type="button" class="fix" data-button="copyAllLinks" onClick={onCopyLinks}>
            Copy all links
          </button>
        )}
        {panel.canRetry && (
          <button type="button" class="fix" data-button="retryFailed" onClick={onRetry}>
            Retry failed
          </button>
        )}
        <button type="button" class="fix" data-button="close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
