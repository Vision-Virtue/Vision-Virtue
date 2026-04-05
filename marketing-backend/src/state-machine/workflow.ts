import { WorkflowState, ContentItem } from '../types';
import { contentRepository } from '../db/repository';
import { ApiError } from '../types';

// ─── Valid Transition Map ─────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  IDEA_IDENTIFIED: ['ECONOMIST_BRIEF_READY'],
  ECONOMIST_BRIEF_READY: ['DRAFT_READY'],
  DRAFT_READY: ['UNDER_VP_REVIEW'],
  UNDER_VP_REVIEW: ['AWAITING_RAPHAEL_APPROVAL', 'RETURNED_FOR_REVISION', 'REJECTED'],
  RETURNED_FOR_REVISION: ['DRAFT_READY'],
  AWAITING_RAPHAEL_APPROVAL: ['APPROVED_FOR_PUBLISHING', 'RETURNED_FOR_REVISION', 'REJECTED'],
  APPROVED_FOR_PUBLISHING: ['PUBLISHED'],
  PUBLISHED: [],
  REJECTED: [],
};

// ─── State Machine ────────────────────────────────────────────────────────────

export class WorkflowStateMachine {
  /**
   * Check whether a transition between two states is valid.
   */
  canTransition(from: WorkflowState, to: WorkflowState): boolean {
    const allowed = VALID_TRANSITIONS[from] ?? [];
    return allowed.includes(to);
  }

  /**
   * Return all valid next states from a given state.
   */
  getAvailableTransitions(state: WorkflowState): WorkflowState[] {
    return VALID_TRANSITIONS[state] ?? [];
  }

  /**
   * Perform a state transition on a ContentItem.
   * Persists the change, writes an audit entry, and returns the updated item.
   * Throws ApiError(400) if the transition is not valid.
   */
  transition(
    item: ContentItem,
    to: WorkflowState,
    actor: string,
    details: Record<string, unknown> = {},
  ): ContentItem {
    if (!this.canTransition(item.state, to)) {
      throw new ApiError(
        400,
        `Invalid transition from ${item.state} to ${to}`,
        'INVALID_TRANSITION',
        {
          from: item.state,
          to,
          allowed: this.getAvailableTransitions(item.state),
        },
      );
    }

    const previousState = item.state;

    // Update the item state
    const updated = contentRepository.update(item.id, { state: to });

    // Append audit entry
    contentRepository.addAuditEntry({
      content_id: item.id,
      action: `STATE_TRANSITION: ${previousState} → ${to}`,
      actor,
      previous_state: previousState,
      new_state: to,
      details,
    });

    return updated;
  }
}

// Singleton export
export const workflowStateMachine = new WorkflowStateMachine();
