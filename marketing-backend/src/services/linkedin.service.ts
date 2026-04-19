import axios, { AxiosError } from 'axios';
import fs from 'fs';
import path from 'path';
import { LinkedInAccount, ApiError } from '../types';
import { v4 as uuidv4 } from 'uuid';

const LINKEDIN_API_BASE = 'https://api.linkedin.com';
const LINKEDIN_AUTH_BASE = 'https://www.linkedin.com/oauth/v2';

// ─── LinkedIn Service ─────────────────────────────────────────────────────────

export class LinkedInService {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    private readonly organizationId: string,
  ) {}

  // ── OAuth ─────────────────────────────────────────────────────────────────────

  getAuthorizationUrl(state: string): string {
    // Share on LinkedIn — Default Tier, no approval needed.
    // w_member_social is the only scope required for posting as the authenticated member.
    // TODO: add r_organization_social w_organization_social rw_organization_admin
    //       once LinkedIn approves the Community Management API application.
    const scopes = ['w_member_social'].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: scopes,
    });

    return `${LINKEDIN_AUTH_BASE}/authorization?${params.toString()}`;
  }

  async getPersonUrn(token: string): Promise<string> {
    // Try /v2/me — works when r_liteprofile scope is available
    try {
      const response = await axios.get(`${LINKEDIN_API_BASE}/v2/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });
      const id = (response.data as { id?: string }).id;
      if (id) return `urn:li:person:${id}`;
    } catch { /* fall through */ }

    // Try token introspection — returns sub (member ID), works with w_member_social only
    try {
      const intro = await axios.post(
        `${LINKEDIN_AUTH_BASE}/introspectToken`,
        new URLSearchParams({
          token,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      const sub = (intro.data as { sub?: string }).sub;
      if (sub) return `urn:li:person:${sub}`;
    } catch { /* fall through */ }

    // Fallback: LINKEDIN_PERSON_URN env var (set manually in Render dashboard)
    const envUrn = process.env.LINKEDIN_PERSON_URN;
    if (envUrn) return envUrn;

    throw this.mapLinkedInError(
      new Error('Could not determine LinkedIn person URN. Set LINKEDIN_PERSON_URN in Render env vars.'),
      'getPersonUrn',
    );
  }

  async exchangeCodeForToken(code: string): Promise<LinkedInAccount> {
    try {
      const response = await axios.post(
        `${LINKEDIN_AUTH_BASE}/accessToken`,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      const data = response.data as {
        access_token: string;
        expires_in: number;
        refresh_token?: string;
      };

      const expiresAt = Date.now() + data.expires_in * 1000;
      const personUrn = await this.getPersonUrn(data.access_token);

      return {
        id: uuidv4(),
        access_token: data.access_token,
        refresh_token: data.refresh_token || '',
        expires_at: expiresAt,
        organization_id: this.organizationId,
        person_urn: personUrn,
        created_at: new Date().toISOString(),
      };
    } catch (err) {
      throw this.mapLinkedInError(err, 'Failed to exchange OAuth code for token');
    }
  }

  // ── Organization Profile ──────────────────────────────────────────────────────

  async getOrganizationProfile(token: string): Promise<unknown> {
    try {
      const response = await axios.get(
        `${LINKEDIN_API_BASE}/v2/organizations/${this.organizationId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        },
      );
      return response.data;
    } catch (err) {
      throw this.mapLinkedInError(err, 'Failed to fetch organization profile');
    }
  }

  async updateOrganizationProfile(token: string, updates: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await axios.post(
        `${LINKEDIN_API_BASE}/v2/organizations/${this.organizationId}`,
        updates,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        },
      );
      return response.data;
    } catch (err) {
      throw this.mapLinkedInError(err, 'Failed to update organization profile');
    }
  }

  // ── Posts ─────────────────────────────────────────────────────────────────────

  async createTextPost(
    token: string,
    text: string,
    authorUrn: string,  // urn:li:person:X (personal) or urn:li:organization:X (org page)
  ): Promise<{ postId: string }> {
    try {
      // Use /v2/ugcPosts — stable endpoint for Share on LinkedIn,
      // does not require a versioned LinkedIn-Version header.
      const payload = {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      const response = await axios.post(`${LINKEDIN_API_BASE}/v2/ugcPosts`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      const postId =
        (response.headers['x-restli-id'] as string) ||
        (response.data as { id?: string })?.id ||
        uuidv4();

      return { postId };
    } catch (err) {
      throw this.mapLinkedInError(err, 'Failed to create text post');
    }
  }

  async createImagePost(
    token: string,
    text: string,
    imageUrl: string,
    authorUrn: string,  // urn:li:person:X (personal) or urn:li:organization:X (org page)
  ): Promise<{ postId: string }> {
    try {
      // Step 1: Register image upload via v2 assets API (no LinkedIn-Version header)
      const registerResponse = await axios.post(
        `${LINKEDIN_API_BASE}/v2/assets?action=registerUpload`,
        {
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: authorUrn,
            serviceRelationships: [
              {
                relationshipType: 'OWNER',
                identifier: 'urn:li:userGeneratedContent',
              },
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        },
      );

      const registerData = registerResponse.data as {
        value: {
          uploadMechanism: {
            'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
              uploadUrl: string;
            };
          };
          asset: string;
        };
      };
      const uploadUrl =
        registerData.value.uploadMechanism[
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
        ].uploadUrl;
      const assetUrn = registerData.value.asset;

      // Step 2: Fetch image data from URL (SSRF guard: https only)
      const parsedUrl = new URL(imageUrl);
      if (parsedUrl.protocol !== 'https:') {
        throw new ApiError(400, 'Image URL must use HTTPS', 'INVALID_URL');
      }
      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', maxRedirects: 3 });
      const imageBuffer = Buffer.from(imageResponse.data as ArrayBuffer);

      // Step 3: Upload image binary
      await axios.put(uploadUrl, imageBuffer, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
      });

      // Step 4: Create UGC post referencing the uploaded asset
      const payload = {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'IMAGE',
            media: [
              {
                status: 'READY',
                description: { text: 'Vision & Virtue' },
                media: assetUrn,
                title: { text: 'Vision & Virtue' },
              },
            ],
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      const postResponse = await axios.post(`${LINKEDIN_API_BASE}/v2/ugcPosts`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      const postId =
        (postResponse.headers['x-restli-id'] as string) ||
        (postResponse.data as { id?: string })?.id ||
        uuidv4();

      return { postId };
    } catch (err) {
      throw this.mapLinkedInError(err, 'Failed to create image post');
    }
  }

  async uploadMediaAsset(token: string, filePath: string): Promise<string> {
    try {
      const absolutePath = path.resolve(filePath);
      const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
      if (!absolutePath.startsWith(uploadDir + path.sep)) {
        throw new ApiError(400, 'Invalid file path', 'INVALID_PATH');
      }
      if (!fs.existsSync(absolutePath)) {
        throw new ApiError(400, 'File not found', 'FILE_NOT_FOUND');
      }

      // Register upload via v2 assets API
      const registerResponse = await axios.post(
        `${LINKEDIN_API_BASE}/v2/assets?action=registerUpload`,
        {
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: `urn:li:organization:${this.organizationId}`,
            serviceRelationships: [
              {
                relationshipType: 'OWNER',
                identifier: 'urn:li:userGeneratedContent',
              },
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        },
      );

      const registerData = registerResponse.data as {
        value: {
          uploadMechanism: {
            'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
              uploadUrl: string;
            };
          };
          asset: string;
        };
      };
      const uploadUrl =
        registerData.value.uploadMechanism[
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
        ].uploadUrl;
      const assetUrn = registerData.value.asset;

      // Upload binary
      const fileBuffer = fs.readFileSync(absolutePath);
      await axios.put(uploadUrl, fileBuffer, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
      });

      return assetUrn;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw this.mapLinkedInError(err, 'Failed to upload media asset');
    }
  }

  async getPostAnalytics(token: string, postId: string): Promise<unknown> {
    try {
      const response = await axios.get(
        `${LINKEDIN_API_BASE}/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${this.organizationId}&shares=List(${encodeURIComponent(postId)})`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        },
      );
      return response.data;
    } catch (err) {
      throw this.mapLinkedInError(err, 'Failed to fetch post analytics');
    }
  }

  // ── Error Handler ─────────────────────────────────────────────────────────────

  private mapLinkedInError(err: unknown, context: string): ApiError {
    if (err instanceof ApiError) return err;

    const axiosErr = err as AxiosError;
    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const data = axiosErr.response.data as { message?: string; error?: string } | undefined;
      const message = data?.message || data?.error || axiosErr.message;
      return new ApiError(
        status === 401 ? 401 : status === 403 ? 403 : 502,
        `${context}: ${message}`,
        `LINKEDIN_${status}`,
        data,
      );
    }

    return new ApiError(502, `${context}: ${(err as Error).message}`, 'LINKEDIN_NETWORK_ERROR');
  }
}
