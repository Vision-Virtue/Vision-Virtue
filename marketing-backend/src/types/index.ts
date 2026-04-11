// ─── Workflow States ───────────────────────────────────────────────────────────

export type WorkflowState =
  | 'IDEA_IDENTIFIED'
  | 'ECONOMIST_BRIEF_READY'
  | 'DRAFT_READY'
  | 'UNDER_VP_REVIEW'
  | 'AWAITING_RAPHAEL_APPROVAL'
  | 'RETURNED_TO_VP_FOR_CORRECTIONS'
  | 'APPROVED_FOR_PUBLISHING'
  | 'PUBLISHED'
  | 'RETURNED_FOR_REVISION'
  | 'REJECTED';

// ─── Economist Brief ──────────────────────────────────────────────────────────

export interface EconomistBrief {
  summary: string;
  key_indicators: {
    inflation: string;
    interest_rates: string;
    gdp_growth: string;
    labor_market: string;
    fiscal_policy: string;
    capital_markets: string;
  };
  israel_context: string;
  us_context: string;
  global_context: string;
  geopolitical_implications: string;
  central_bank_stance: string;
  risks_and_uncertainties: string[];
  actionable_insights: string[];
  requires_verification: boolean;
  data_sources_needed: string[];
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW';
  generated_at: string;
}

// ─── Marketing Draft ──────────────────────────────────────────────────────────

export interface LinkedInPostContent {
  text: string;
  hashtags: string[];
  call_to_action: string;
  character_count: number;
}

export interface MarketingDraft {
  hebrew: LinkedInPostContent;
  english: LinkedInPostContent;
  content_angle: string;
  target_audience: string;
  key_message: string;
  tone: string;
  generated_at: string;
}

// ─── VP Review ────────────────────────────────────────────────────────────────

export interface VpReview {
  decision: 'APPROVED' | 'REVISE' | 'REJECT';
  comments: string;
  edits: {
    hebrew?: string;
    english?: string;
    general?: string;
  };
  factual_accuracy_score: number;
  brand_alignment_score: number;
  clarity_score: number;
  reputational_risk: 'LOW' | 'MEDIUM' | 'HIGH';
  reviewed_at: string;
}

// ─── Economist Q&A ────────────────────────────────────────────────────────────

export interface QAEntry {
  question: string;
  answer: string;
  asked_at: string;
}

// ─── Approval ─────────────────────────────────────────────────────────────────

export interface Approval {
  approved_by: string;
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION';
  notes: string;
  approved_at: string;
}

// ─── Raphael Annotation ───────────────────────────────────────────────────────

export interface RaphaelAnnotation {
  id: string;
  lang: 'hebrew' | 'english';
  selectedText: string;
  comment: string;
}

// ─── Content Metadata ─────────────────────────────────────────────────────────

export interface ContentMetadata {
  word_count_hebrew?: number;
  word_count_english?: number;
  revision_count: number;
  time_to_approval?: number;
  tags?: string[];
  raphael_annotations?: RaphaelAnnotation[];
}

// ─── Publish Result ───────────────────────────────────────────────────────────

export interface PublishResult {
  hebrew_post_id?: string;
  english_post_id?: string;
  published_at: string;
  platform: 'linkedin';
  organization_id: string;
  errors?: string[];
}

// ─── Content Item ─────────────────────────────────────────────────────────────

export interface ContentItem {
  id: string;
  topic: string;
  state: WorkflowState;
  economist_brief: EconomistBrief | null;
  marketing_draft: MarketingDraft | null;
  vp_review: VpReview | null;
  approval: Approval | null;
  metadata: ContentMetadata;
  publish_result: PublishResult | null;
  revision_history: RevisionEntry[];
  qa_history: QAEntry[];
  created_at: string;
  updated_at: string;
}

// ─── Revision History ─────────────────────────────────────────────────────────

export interface RevisionEntry {
  revision_number: number;
  state_at_revision: WorkflowState;
  notes: string;
  revised_at: string;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  content_id: string;
  action: string;
  actor: string;
  previous_state: WorkflowState | null;
  new_state: WorkflowState | null;
  details: Record<string, unknown>;
  created_at: string;
}

// ─── LinkedIn Account ─────────────────────────────────────────────────────────

export interface LinkedInAccount {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  organization_id: string;
  created_at: string;
}

// ─── AI Response Contract ─────────────────────────────────────────────────────

export interface AIResponse {
  stage: 'economist' | 'draft' | 'review';
  economist_brief?: EconomistBrief;
  marketing_draft?: MarketingDraft;
  vp_review?: VpReview;
  model_version: string;
  processing_notes?: string;
}

// ─── LinkedIn Post ────────────────────────────────────────────────────────────

export interface LinkedInPost {
  id?: string;
  author: string;
  text: string;
  visibility: 'PUBLIC' | 'CONNECTIONS';
  media?: {
    title: string;
    description: string;
    media_category: string;
    original_url?: string;
    asset_urn?: string;
  };
}

// ─── API Error ────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}
