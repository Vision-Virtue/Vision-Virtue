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
    const scopes = ['r_organization_social', 'w_organization_social', 'rw_organization_admin'].join(
      ' ',
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: scopes,
    });

    return `${LINKEDIN_AUTH_BASE}/authorization?${params.toString()}`;
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
        refresh_token_expires_in?: number;
      };

      const expiresAt = Date.now() + data.expires_in * 1000;

      return {
        id: uuidv4(),
        access_token: data.access_token,
        refresh_token: data.refresh_token || '',
        expires_at: expiresAt,
        organization_id: this.organizationId,
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
    organizationId: string,
  ): Promise<{ postId: string }> {
    try {
      const payload = {
        author: `urn:li:organization:${organizationId}`,
        commentary: text,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      };

      const response = await axios.post(`${LINKEDIN_API_BASE}/rest/posts`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202401',
        },
      });

      // LinkedIn returns the post ID in the x-restli-id header or response body
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
    organizationId: string,
  ): Promise<{ postId: string }> {
    try {
      // Step 1: Initialize image upload
      const initResponse = await axios.post(
        `${LINKEDIN_API_BASE}/rest/images?action=initializeUpload`,
        {
          initializeUploadRequest: {
            owner: `urn:li:organization:${organizationId}`,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202401',
          },
        },
      );

      const { uploadUrl, image } = (
        initResponse.data as {
          value: { uploadUrl: string; image: string };
        }
      ).value;

      // Step 2: Fetch image data from URL
      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(imageResponse.data as ArrayBuffer);

      // Step 3: Upload image binary
      await axios.put(uploadUrl, imageBuffer, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
      });

      // Step 4: Create post with image
      const payload = {
        author: `urn:li:organization:${organizationId}`,
        commentary: text,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: {
          media: {
            title: 'Vision & Virtue',
            id: image,
          },
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      };

      const postResponse = await axios.post(`${LINKEDIN_API_BASE}/rest/posts`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202401',
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
      if (!fs.existsSync(absolutePath)) {
        throw new ApiError(400, `File not found: ${filePath}`, 'FILE_NOT_FOUND');
      }

      // Initialize upload
      const initResponse = await axios.post(
        `${LINKEDIN_API_BASE}/rest/images?action=initializeUpload`,
        {
          initializeUploadRequest: {
            owner: `urn:li:organization:${this.organizationId}`,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202401',
          },
        },
      );

      const { uploadUrl, image: assetUrn } = (
        initResponse.data as {
          value: { uploadUrl: string; image: string };
        }
      ).value;

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
        `${LINKEDIN_API_BASE}/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${this.organizationId}&shares=List(${encodeURIComponent(postId)})`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202401',
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
