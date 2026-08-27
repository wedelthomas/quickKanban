import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card } from '../../shared/types.js';

const PRIORITY_LABEL: Record<Card['priority'], string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

const formatDue = (iso: string): string => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
};

/**
 * Dense by requirement, not by taste: roughly 50 of these must be legible at
 * once (NFR-13, SC-006). Priority is a coloured dot rather than a word because
 * the card is scanned, not read.
 */
export const CardView = ({
  card,
  onOpen,
}: {
  card: Card;
  onOpen: (card: Card) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.id,
    });

  return (
    <article
      ref={setNodeRef}
      className={`card${isDragging ? ' card--dragging' : ''}${card.blocked ? ' card--blocked' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="card"
      data-card-id={card.id}
      onDoubleClick={() => onOpen(card)}
      {...attributes}
      {...listeners}
    >
      <div className="card-title">{card.title}</div>
      <div className="card-meta">
        <span
          className={`priority priority--${card.priority}`}
          data-testid="card-priority"
          title={PRIORITY_LABEL[card.priority]}
          aria-label={PRIORITY_LABEL[card.priority]}
        />
        {card.dueDate && (
          <span
            className={`due${card.overdue ? ' due--overdue' : ''}`}
            data-testid="card-due"
            data-overdue={card.overdue}
          >
            {formatDue(card.dueDate)}
          </span>
        )}
        {card.blocked && (
          // Named, not just coloured: the text is what makes this survive
          // greyscale and a colour-blind reader (FR-411).
          <span
            className="badge badge--blocked"
            data-testid="card-blocked"
            title="Blocked — this card still moves"
          >
            Blocked
          </span>
        )}
        {card.blockedDivergesFromJira && (
          // Not a conflict, and deliberately not styled like one: the card is
          // not frozen and needs no decision (FR-419).
          <span
            className="badge badge--blocked-diverges"
            data-testid="card-blocked-diverges"
            title="Jira disagrees about this card being blocked. Your setting is the one in force."
          >
            ≠ Jira
          </span>
        )}
        {card.hasConflict && (
          // Frozen, not decorated: this badge is the only warning the user gets
          // that dragging this card will be refused until they decide (FR-236).
          <span
            className="badge badge--conflict"
            data-testid="card-conflict"
            title="Conflict with Jira — resolve to move this card"
          >
            Conflict
          </span>
        )}
        {card.issueKey && (
          // The key doubles as the source marker: it says both "this is Jira's"
          // and which issue, in the space a generic badge would have used to
          // say only the first.
          <a
            className="badge badge--link"
            data-testid="issue-link"
            href={card.issueUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <span data-testid="card-source">{card.issueKey}</span>
          </a>
        )}
        {card.tags.map((tag) => (
          <span className="tag" data-testid="card-tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
};
