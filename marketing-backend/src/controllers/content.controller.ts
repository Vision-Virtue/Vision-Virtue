import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { contentRepository } from '../db/repository';
import { workflowStateMachine } from '../state-machine/workflow';
import { AIService } from '../services/ai.service';
import { LinkedInService } from '../services/linkedin.service';
import { BraveSearchService } from '../services/search.service';
import { ApiError, Approval, QAEntry, RaphaelAnnotation } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAIService(): AIService {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ApiError(500, 'ANTHROPIC_API_KEY is not configured on the server', 'MISSING_CONFIG');
  }
  return new AIService(new Anthropic({ apiKey }));
}

function getSearchService(): BraveSearchService | undefined {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  return key ? new BraveSearchService(key) : undefined;
}

function getLinkedInService(): LinkedInService {
  return new LinkedInService(
    process.env.LINKEDIN_CLIENT_ID || '',
    process.env.LINKEDIN_CLIENT_SECRET || '',
    process.env.LINKEDIN_REDIRECT_URI || '',
    process.env.LINKEDIN_ORGANIZATION_ID || '',
  );
}

// ─── Content Controller ───────────────────────────────────────────────────────

export class ContentController {
  // POST /api/content
  async createTopic(req: Request, res: Response): Promise<void> {
    const { topic } = req.body as { topic?: string };

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'topic is required and must be a non-empty string' },
      });
      return;
    }

    if (topic.trim().length > 2000) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'topic must be 2000 characters or fewer' },
      });
      return;
    }

    const item = contentRepository.create(topic.trim());

    contentRepository.addAuditEntry({
      content_id: item.id,
      action: 'TOPIC_CREATED',
      actor: 'system',
      previous_state: null,
      new_state: 'IDEA_IDENTIFIED',
      details: { topic: item.topic },
    });

    res.status(201).json({ success: true, data: item });
  }

  // POST /api/content/:id/economist-brief
  async generateEconomistBrief(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const item = contentRepository.findById(id);
    if (!item) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Content item ${id} not found` } });
      return;
    }

    if (item.state !== 'IDEA_IDENTIFIED' && item.state !== 'RETURNED_FOR_REVISION') {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: `Cannot generate economist brief from state: ${item.state}`,
        },
      });
      return;
    }

    const aiService = getAIService();
    const aiResponse = await aiService.runChiefEconomist(item.topic, getSearchService());

    if (!aiResponse.economist_brief) {
      res.status(500).json({ error: { code: 'AI_ERROR', message: 'No economist brief in AI response' } });
      return;
    }

    // If coming from RETURNED_FOR_REVISION, we need to go through IDEA_IDENTIFIED first
    // Actually state machine allows IDEA_IDENTIFIED → ECONOMIST_BRIEF_READY only
    // If state is RETURNED_FOR_REVISION, it must go DRAFT_READY first (re-draft),
    // but user can regenerate brief before re-drafting
    let updatedItem = contentRepository.update(id, { economist_brief: aiResponse.economist_brief });

    // Only transition if in IDEA_IDENTIFIED state
    if (item.state === 'IDEA_IDENTIFIED') {
      updatedItem = workflowStateMachine.transition(
        updatedItem,
        'ECONOMIST_BRIEF_READY',
        'Dr. Ethan Ross (AI)',
        { model_version: aiResponse.model_version },
      );
    }

    contentRepository.addAuditEntry({
      content_id: id,
      action: 'ECONOMIST_BRIEF_GENERATED',
      actor: 'Dr. Ethan Ross (AI)',
      previous_state: item.state,
      new_state: updatedItem.state,
      details: {
        confidence_level: aiResponse.economist_brief.confidence_level,
        requires_verification: aiResponse.economist_brief.requires_verification,
      },
    });

    res.json({ success: true, data: updatedItem });
  }

  // POST /api/content/:id/marketing-draft
  async createMarketingDraft(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const item = contentRepository.findById(id);
    if (!item) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Content item ${id} not found` } });
      return;
    }

    if (
      item.state !== 'ECONOMIST_BRIEF_READY' &&
      item.state !== 'RETURNED_FOR_REVISION' &&
      item.state !== 'DRAFT_READY'
    ) {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: `Cannot create marketing draft from state: ${item.state}`,
        },
      });
      return;
    }

    if (!item.economist_brief) {
      res.status(400).json({
        error: { code: 'PREREQUISITE_MISSING', message: 'Economist brief must be generated first' },
      });
      return;
    }

    const aiService = getAIService();
    const aiResponse = await aiService.runMarketingManager(item.topic, item.economist_brief);

    if (!aiResponse.marketing_draft) {
      res.status(500).json({ error: { code: 'AI_ERROR', message: 'No marketing draft in AI response' } });
      return;
    }

    let updatedItem = contentRepository.update(id, { marketing_draft: aiResponse.marketing_draft });

    // Transition to DRAFT_READY if coming from ECONOMIST_BRIEF_READY or RETURNED_FOR_REVISION
    if (item.state === 'ECONOMIST_BRIEF_READY') {
      updatedItem = workflowStateMachine.transition(
        updatedItem,
        'DRAFT_READY',
        'Sofia Chen (AI)',
        { model_version: aiResponse.model_version },
      );
    } else if (item.state === 'RETURNED_FOR_REVISION') {
      updatedItem = workflowStateMachine.transition(
        updatedItem,
        'DRAFT_READY',
        'Sofia Chen (AI)',
        { model_version: aiResponse.model_version },
      );
      // Increment revision count
      const metadata = { ...updatedItem.metadata, revision_count: (updatedItem.metadata.revision_count || 0) + 1 };
      updatedItem = contentRepository.update(id, { metadata });
    }

    contentRepository.addAuditEntry({
      content_id: id,
      action: 'MARKETING_DRAFT_CREATED',
      actor: 'Sofia Chen (AI)',
      previous_state: item.state,
      new_state: updatedItem.state,
      details: {
        content_angle: aiResponse.marketing_draft.content_angle,
        key_message: aiResponse.marketing_draft.key_message,
      },
    });

    res.json({ success: true, data: updatedItem });
  }

  // POST /api/content/:id/vp-review
  async requestVpReview(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const item = contentRepository.findById(id);
    if (!item) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Content item ${id} not found` } });
      return;
    }

    if (item.state !== 'DRAFT_READY' && item.state !== 'UNDER_VP_REVIEW') {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: `VP review requires state DRAFT_READY (or UNDER_VP_REVIEW for recovery), current: ${item.state}`,
        },
      });
      return;
    }

    if (!item.economist_brief || !item.marketing_draft) {
      res.status(400).json({
        error: {
          code: 'PREREQUISITE_MISSING',
          message: 'Both economist brief and marketing draft are required for VP review',
        },
      });
      return;
    }

    const aiService = getAIService();
    const aiResponse = await aiService.runVpMarketing(
      item.topic,
      item.economist_brief,
      item.marketing_draft,
    );

    if (!aiResponse.vp_review) {
      res.status(500).json({ error: { code: 'AI_ERROR', message: 'No VP review in AI response' } });
      return;
    }

    let updatedItem = contentRepository.update(id, { vp_review: aiResponse.vp_review });

    // Transition to UNDER_VP_REVIEW only if not already there (recovery mode skips this)
    if (item.state === 'DRAFT_READY') {
      updatedItem = workflowStateMachine.transition(
        updatedItem,
        'UNDER_VP_REVIEW',
        'Daniel Berg (AI)',
        { decision: aiResponse.vp_review.decision },
      );
    }

    // Apply VP decision — normalize to uppercase and default unexpected values to REVISE
    const vpDecision = (aiResponse.vp_review.decision || '').toString().toUpperCase().trim();
    if (vpDecision === 'APPROVED') {
      updatedItem = workflowStateMachine.transition(
        updatedItem,
        'AWAITING_RAPHAEL_APPROVAL',
        'Daniel Berg (AI)',
        { decision: 'APPROVED', scores: {
          factual_accuracy: aiResponse.vp_review.factual_accuracy_score,
          brand_alignment: aiResponse.vp_review.brand_alignment_score,
          clarity: aiResponse.vp_review.clarity_score,
        }},
      );
    } else if (vpDecision === 'REJECT') {
      updatedItem = workflowStateMachine.transition(
        updatedItem,
        'REJECTED',
        'Daniel Berg (AI)',
        { comments: aiResponse.vp_review.comments },
      );
    } else {
      // REVISE or any unexpected value — always send for revision rather than getting stuck
      updatedItem = workflowStateMachine.transition(
        updatedItem,
        'RETURNED_FOR_REVISION',
        'Daniel Berg (AI)',
        { comments: aiResponse.vp_review.comments },
      );
    }

    contentRepository.addAuditEntry({
      content_id: id,
      action: 'VP_REVIEW_COMPLETED',
      actor: 'Daniel Berg (AI)',
      previous_state: 'DRAFT_READY',
      new_state: updatedItem.state,
      details: {
        decision: vpDecision,
        scores: {
          factual_accuracy: aiResponse.vp_review.factual_accuracy_score,
          brand_alignment: aiResponse.vp_review.brand_alignment_score,
          clarity: aiResponse.vp_review.clarity_score,
        },
        reputational_risk: aiResponse.vp_review.reputational_risk,
      },
    });

    res.json({ success: true, data: updatedItem });
  }

  // POST /api/content/:id/vp-self-edit
  async vpSelfEdit(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const item = contentRepository.findById(id);
    if (!item) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Content item ${id} not found` } });
      return;
    }

    if (item.state !== 'RETURNED_FOR_REVISION') {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: `VP self-edit requires state RETURNED_FOR_REVISION, current: ${item.state}`,
        },
      });
      return;
    }

    if (!item.marketing_draft || !item.vp_review) {
      res.status(400).json({
        error: { code: 'PREREQUISITE_MISSING', message: 'Marketing draft and VP review are required' },
      });
      return;
    }

    const editNotes = {
      hebrew: item.vp_review.edits?.hebrew,
      english: item.vp_review.edits?.english,
      general: item.vp_review.edits?.general,
    };

    const aiService = getAIService();
    const aiResponse = await aiService.runVpSelfEdit(item.topic, item.marketing_draft, editNotes);

    if (!aiResponse.marketing_draft) {
      res.status(500).json({ error: { code: 'AI_ERROR', message: 'No marketing draft in VP self-edit response' } });
      return;
    }

    let updatedItem = contentRepository.update(id, { marketing_draft: aiResponse.marketing_draft });

    // Transition: RETURNED_FOR_REVISION → DRAFT_READY → UNDER_VP_REVIEW → AWAITING_RAPHAEL_APPROVAL
    updatedItem = workflowStateMachine.transition(
      updatedItem,
      'DRAFT_READY',
      'Daniel Berg (AI)',
      { self_edit: true },
    );
    updatedItem = workflowStateMachine.transition(
      updatedItem,
      'UNDER_VP_REVIEW',
      'Daniel Berg (AI)',
      { self_edit: true },
    );
    updatedItem = workflowStateMachine.transition(
      updatedItem,
      'AWAITING_RAPHAEL_APPROVAL',
      'Daniel Berg (AI)',
      { self_edit: true, note: 'VP self-edited after 3 revision cycles' },
    );

    contentRepository.addAuditEntry({
      content_id: id,
      action: 'VP_SELF_EDIT_COMPLETED',
      actor: 'Daniel Berg (AI)',
      previous_state: 'RETURNED_FOR_REVISION',
      new_state: 'AWAITING_RAPHAEL_APPROVAL',
      details: { self_edit: true, model_version: aiResponse.model_version },
    });

    res.json({ success: true, data: updatedItem });
  }

  // POST /api/content/:id/request-approval
  async requestApproval(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const item = contentRepository.findById(id);
    if (!item) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Content item ${id} not found` } });
      return;
    }

    // Idempotent: if already awaiting approval, just return
    if (item.state === 'AWAITING_RAPHAEL_APPROVAL') {
      res.json({ success: true, data: item, message: 'Already awaiting Raphael approval' });
      return;
    }

    if (item.state !== 'UNDER_VP_REVIEW') {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: `Request approval requires state UNDER_VP_REVIEW, current: ${item.state}`,
        },
      });
      return;
    }

    if (!item.vp_review || item.vp_review.decision !== 'APPROVED') {
      res.status(400).json({
        error: {
          code: 'VP_NOT_APPROVED',
          message: 'VP must approve the draft before requesting Raphael approval',
        },
      });
      return;
    }

    const updatedItem = workflowStateMachine.transition(
      item,
      'AWAITING_RAPHAEL_APPROVAL',
      'system',
      { triggered_by: 'manual_request' },
    );

    res.json({ success: true, data: updatedItem });
  }

  // POST /api/content/:id/approve (Raphael)
  async approve(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { notes } = req.body as { notes?: string; passcode?: string };

    const item = contentRepository.findById(id);
    if (!item) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Content item ${id} not found` } });
      return;
    }

    if (item.state !== 'AWAITING_RAPHAEL_APPROVAL') {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: `Approval requires state AWAITING_RAPHAEL_APPROVAL, current: ${item.state}`,
        },
      });
      return;
    }

    const approval: Approval = {
      approved_by: 'Raphael',
      decision: 'APPROVED',
      notes: notes || '',
      approved_at: new Date().toISOString(),
    };

    let updatedItem = contentRepository.update(id, { approval });
    updatedItem = workflowStateMachine.transition(
      updatedItem,
      'APPROVED_FOR_PUBLISHING',
      'Raphael',
      { notes },
    );

    res.json({ success: true, data: updatedItem });
  }

  // POST /api/content/:id/reject (Raphael)
  async reject(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { notes } = req.body as { notes?: string; passcode?: string };

    const item = contentRepository.findById(id);
    if (!item) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Content item ${id} not found` } });
      return;
    }

    if (item.state !== 'AWAITING_RAPHAEL_APPROVAL') {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: `Rejection requires state AWAITING_RAPHAEL_APPROVAL, current: ${item.state}`,
        },
      });
      return;
    }

    const approval: Approval = {
      approved_by: 'Raphael',
      decision: 'REJECTED',
      notes: notes || '',
      approved_at: new Date().toISOString(),
    };

    let updatedItem = contentRepository.update(id, { approval });
    updatedItem = workflowStateMachine.transition(
      updatedItem,
      'REJECTED',
      'Raphael',
      { notes },
    );

    res.json({ success: true, data: updatedItem });
  }

  // POST /api/content/:id/publish
  async publish(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const item = contentRepository.findById(id);
    if (!item) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Content item ${id} not found` } });
      return;
    }

    if (item.state !== 'APPROVED_FOR_PUBLISHING') {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: `Publishing requires state APPROVED_FOR_PUBLISHING, current: ${item.state}`,
        },
      });
      return;
    }

    if (!item.marketing_draft) {
      res.status(400).json({
        error: { code: 'PREREQUISITE_MISSING', message: 'No marketing draft available to publish' },
      });
      return;
    }

    const token = contentRepository.getLinkedInToken();
    if (!token) {
      res.status(401).json({
        error: { code: 'LINKEDIN_NOT_CONNECTED', message: 'LinkedIn is not connected' },
      });
      return;
    }

    if (Date.now() > token.expires_at) {
      res.status(401).json({
        error: { code: 'LINKEDIN_TOKEN_EXPIRED', message: 'LinkedIn token has expired' },
      });
      return;
    }

    const linkedInService = getLinkedInService();

    // Use personal posting (Share on LinkedIn — available now) until LinkedIn
    // approves the Community Management API. Then switch to:
    //   urn:li:organization:${token.organization_id || process.env.LINKEDIN_ORGANIZATION_ID}
    const authorUrn = token.person_urn ||
      (token.organization_id ? `urn:li:organization:${token.organization_id}` : '');
    if (!authorUrn) {
      res.status(400).json({
        error: { code: 'NO_AUTHOR_URN', message: 'LinkedIn account has no person URN — please reconnect LinkedIn.' },
      });
      return;
    }

    const errors: string[] = [];
    let hebrewPostId: string | undefined;
    let englishPostId: string | undefined;

    const hebrewDraft = item.marketing_draft.hebrew;
    const hebrewText = `${hebrewDraft.text}\n\n${hebrewDraft.hashtags.join(' ')}`;

    const englishDraft = item.marketing_draft.english;
    const englishText = `${englishDraft.text}\n\n${englishDraft.hashtags.join(' ')}`;

    console.log(`[PUBLISH] authorUrn: ${authorUrn}`);

    try {
      const result = await linkedInService.createTextPost(token.access_token, hebrewText, authorUrn);
      hebrewPostId = result.postId;
      console.log(`[PUBLISH] Hebrew post ID: ${hebrewPostId}`);
    } catch (err) {
      console.error(`[PUBLISH ERROR] Hebrew post failed:`, err);
      errors.push(`Hebrew post failed: ${(err as Error).message}`);
    }

    try {
      const result = await linkedInService.createTextPost(token.access_token, englishText, authorUrn);
      englishPostId = result.postId;
      console.log(`[PUBLISH] English post ID: ${englishPostId}`);
    } catch (err) {
      console.error(`[PUBLISH ERROR] English post failed:`, err);
      errors.push(`English post failed: ${(err as Error).message}`);
    }

    const publishResult = {
      hebrew_post_id: hebrewPostId,
      english_post_id: englishPostId,
      published_at: new Date().toISOString(),
      platform: 'linkedin' as const,
      organization_id: authorUrn,
      errors: errors.length > 0 ? errors : undefined,
    };

    let updatedItem = contentRepository.update(id, { publish_result: publishResult });
    updatedItem = workflowStateMachine.transition(
      updatedItem,
      'PUBLISHED',
      'system',
      { publish_result: publishResult },
    );

    contentRepository.addAuditEntry({
      content_id: id,
      action: 'PUBLISHED_TO_LINKEDIN',
      actor: 'system',
      previous_state: 'APPROVED_FOR_PUBLISHING',
      new_state: 'PUBLISHED',
      details: { publish_result: publishResult },
    });

    res.json({ success: true, data: updatedItem });
  }

  // GET /api/content/:id
  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const item = contentRepository.findById(id);
    if (!item) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Content item ${id} not found` } });
      return;
    }

    const history = contentRepository.getHistory(id);
    res.json({ success: true, data: { ...item, audit_history: history } });
  }

  // GET /api/content
  async getAll(_req: Request, res: Response): Promise<void> {
    const items = contentRepository.findAll();
    res.json({ success: true, data: items, count: items.length });
  }

  // POST /api/content/:id/ask-economist
  async askEconomist(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { question } = req.body as { question?: string };

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'question is required and must be a non-empty string' },
      });
      return;
    }

    const item = contentRepository.findById(id);
    if (!item) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Content item ${id} not found` } });
      return;
    }

    if (item.state !== 'AWAITING_RAPHAEL_APPROVAL' && item.state !== 'RETURNED_TO_VP_FOR_CORRECTIONS') {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: `Economist Q&A requires state AWAITING_RAPHAEL_APPROVAL or RETURNED_TO_VP_FOR_CORRECTIONS, current: ${item.state}`,
        },
      });
      return;
    }

    if (!item.economist_brief || !item.marketing_draft) {
      res.status(400).json({
        error: { code: 'PREREQUISITE_MISSING', message: 'Economist brief and marketing draft are required' },
      });
      return;
    }

    const aiService = getAIService();
    const answer = await aiService.askEconomist(
      item.topic,
      item.economist_brief,
      item.marketing_draft,
      item.qa_history,
      question.trim(),
    );

    const entry: QAEntry = {
      question: question.trim(),
      answer,
      asked_at: new Date().toISOString(),
    };

    const updatedItem = contentRepository.appendQAEntry(id, entry);
    res.json({ success: true, data: updatedItem });
  }

  // POST /api/content/:id/return-to-vp (Raphael sends annotated posts back to Daniel)
  async returnToVp(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { annotations } = req.body as { annotations?: RaphaelAnnotation[] };

    const item = contentRepository.findById(id);
    if (!item) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Content item ${id} not found` } });
      return;
    }

    if (item.state !== 'AWAITING_RAPHAEL_APPROVAL') {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: `Return to VP requires state AWAITING_RAPHAEL_APPROVAL, current: ${item.state}`,
        },
      });
      return;
    }

    if (!annotations || !Array.isArray(annotations) || annotations.length === 0) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'At least one annotation is required to return to VP' },
      });
      return;
    }

    // Save annotations into metadata
    const metadata = { ...item.metadata, raphael_annotations: annotations };
    let updatedItem = contentRepository.update(id, { metadata });

    updatedItem = workflowStateMachine.transition(
      updatedItem,
      'RETURNED_TO_VP_FOR_CORRECTIONS',
      'Raphael',
      { annotation_count: annotations.length },
    );

    contentRepository.addAuditEntry({
      content_id: id,
      action: 'RETURNED_TO_VP_FOR_CORRECTIONS',
      actor: 'Raphael',
      previous_state: 'AWAITING_RAPHAEL_APPROVAL',
      new_state: 'RETURNED_TO_VP_FOR_CORRECTIONS',
      details: { annotation_count: annotations.length },
    });

    res.json({ success: true, data: updatedItem });
  }

  // POST /api/content/:id/vp-correct (Daniel fixes Raphael's annotations via AI)
  async vpCorrect(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const item = contentRepository.findById(id);
    if (!item) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Content item ${id} not found` } });
      return;
    }

    if (item.state !== 'RETURNED_TO_VP_FOR_CORRECTIONS') {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: `VP correct requires state RETURNED_TO_VP_FOR_CORRECTIONS, current: ${item.state}`,
        },
      });
      return;
    }

    if (!item.marketing_draft) {
      res.status(400).json({
        error: { code: 'PREREQUISITE_MISSING', message: 'Marketing draft is required' },
      });
      return;
    }

    const annotations = item.metadata.raphael_annotations || [];
    if (annotations.length === 0) {
      res.status(400).json({
        error: { code: 'PREREQUISITE_MISSING', message: 'No annotations found to correct' },
      });
      return;
    }

    const aiService = getAIService();
    const aiResponse = await aiService.runVpCorrectAnnotations(
      item.topic,
      item.marketing_draft,
      annotations,
    );

    if (!aiResponse.marketing_draft) {
      res.status(500).json({ error: { code: 'AI_ERROR', message: 'No marketing draft in VP correction response' } });
      return;
    }

    // Save corrected draft, clear annotations
    const metadata = { ...item.metadata, raphael_annotations: [] };
    let updatedItem = contentRepository.update(id, {
      marketing_draft: aiResponse.marketing_draft,
      metadata,
    });

    // Transition back to Raphael's review
    updatedItem = workflowStateMachine.transition(
      updatedItem,
      'AWAITING_RAPHAEL_APPROVAL',
      'Daniel Berg (AI)',
      { corrections_applied: annotations.length },
    );

    contentRepository.addAuditEntry({
      content_id: id,
      action: 'VP_CORRECTIONS_APPLIED',
      actor: 'Daniel Berg (AI)',
      previous_state: 'RETURNED_TO_VP_FOR_CORRECTIONS',
      new_state: 'AWAITING_RAPHAEL_APPROVAL',
      details: { corrections_applied: annotations.length, model_version: aiResponse.model_version },
    });

    res.json({ success: true, data: updatedItem });
  }
}

export const contentController = new ContentController();
