"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkedInService = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const types_1 = require("../types");
const uuid_1 = require("uuid");
const LINKEDIN_API_BASE = 'https://api.linkedin.com';
const LINKEDIN_AUTH_BASE = 'https://www.linkedin.com/oauth/v2';
// ─── LinkedIn Service ─────────────────────────────────────────────────────────
class LinkedInService {
    constructor(clientId, clientSecret, redirectUri, organizationId) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.organizationId = organizationId;
    }
    // ── OAuth ─────────────────────────────────────────────────────────────────────
    getAuthorizationUrl(state) {
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
    async getPersonUrn(token) {
        // Try /v2/me — works for many apps even without an explicit r_liteprofile scope
        try {
            const response = await axios_1.default.get(`${LINKEDIN_API_BASE}/v2/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'X-Restli-Protocol-Version': '2.0.0',
                },
            });
            const id = response.data.id;
            if (id)
                return `urn:li:person:${id}`;
        }
        catch { /* fall through to env var */ }
        // Fallback: LINKEDIN_PERSON_URN env var (set manually in Render dashboard)
        const envUrn = process.env.LINKEDIN_PERSON_URN;
        if (envUrn)
            return envUrn;
        throw this.mapLinkedInError(new Error('Could not determine LinkedIn person URN. Set LINKEDIN_PERSON_URN in Render env vars.'), 'getPersonUrn');
    }
    async exchangeCodeForToken(code) {
        try {
            const response = await axios_1.default.post(`${LINKEDIN_AUTH_BASE}/accessToken`, new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: this.redirectUri,
                client_id: this.clientId,
                client_secret: this.clientSecret,
            }).toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });
            const data = response.data;
            const expiresAt = Date.now() + data.expires_in * 1000;
            const personUrn = await this.getPersonUrn(data.access_token);
            return {
                id: (0, uuid_1.v4)(),
                access_token: data.access_token,
                refresh_token: data.refresh_token || '',
                expires_at: expiresAt,
                organization_id: this.organizationId,
                person_urn: personUrn,
                created_at: new Date().toISOString(),
            };
        }
        catch (err) {
            throw this.mapLinkedInError(err, 'Failed to exchange OAuth code for token');
        }
    }
    // ── Organization Profile ──────────────────────────────────────────────────────
    async getOrganizationProfile(token) {
        try {
            const response = await axios_1.default.get(`${LINKEDIN_API_BASE}/v2/organizations/${this.organizationId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'X-Restli-Protocol-Version': '2.0.0',
                },
            });
            return response.data;
        }
        catch (err) {
            throw this.mapLinkedInError(err, 'Failed to fetch organization profile');
        }
    }
    async updateOrganizationProfile(token, updates) {
        try {
            const response = await axios_1.default.post(`${LINKEDIN_API_BASE}/v2/organizations/${this.organizationId}`, updates, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0',
                },
            });
            return response.data;
        }
        catch (err) {
            throw this.mapLinkedInError(err, 'Failed to update organization profile');
        }
    }
    // ── Posts ─────────────────────────────────────────────────────────────────────
    async createTextPost(token, text, authorUrn) {
        try {
            const payload = {
                author: authorUrn,
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
            const response = await axios_1.default.post(`${LINKEDIN_API_BASE}/rest/posts`, payload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0',
                    'LinkedIn-Version': '202401',
                },
            });
            // LinkedIn returns the post ID in the x-restli-id header or response body
            const postId = response.headers['x-restli-id'] ||
                response.data?.id ||
                (0, uuid_1.v4)();
            return { postId };
        }
        catch (err) {
            throw this.mapLinkedInError(err, 'Failed to create text post');
        }
    }
    async createImagePost(token, text, imageUrl, authorUrn) {
        try {
            // Step 1: Initialize image upload
            const initResponse = await axios_1.default.post(`${LINKEDIN_API_BASE}/rest/images?action=initializeUpload`, {
                initializeUploadRequest: {
                    owner: authorUrn,
                },
            }, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0',
                    'LinkedIn-Version': '202401',
                },
            });
            const { uploadUrl, image } = initResponse.data.value;
            // Step 2: Fetch image data from URL
            const imageResponse = await axios_1.default.get(imageUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(imageResponse.data);
            // Step 3: Upload image binary
            await axios_1.default.put(uploadUrl, imageBuffer, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/octet-stream',
                },
            });
            // Step 4: Create post with image
            const payload = {
                author: authorUrn,
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
            const postResponse = await axios_1.default.post(`${LINKEDIN_API_BASE}/rest/posts`, payload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0',
                    'LinkedIn-Version': '202401',
                },
            });
            const postId = postResponse.headers['x-restli-id'] ||
                postResponse.data?.id ||
                (0, uuid_1.v4)();
            return { postId };
        }
        catch (err) {
            throw this.mapLinkedInError(err, 'Failed to create image post');
        }
    }
    async uploadMediaAsset(token, filePath) {
        try {
            const absolutePath = path_1.default.resolve(filePath);
            if (!fs_1.default.existsSync(absolutePath)) {
                throw new types_1.ApiError(400, `File not found: ${filePath}`, 'FILE_NOT_FOUND');
            }
            // Initialize upload
            const initResponse = await axios_1.default.post(`${LINKEDIN_API_BASE}/rest/images?action=initializeUpload`, {
                initializeUploadRequest: {
                    owner: `urn:li:organization:${this.organizationId}`,
                },
            }, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0',
                    'LinkedIn-Version': '202401',
                },
            });
            const { uploadUrl, image: assetUrn } = initResponse.data.value;
            // Upload binary
            const fileBuffer = fs_1.default.readFileSync(absolutePath);
            await axios_1.default.put(uploadUrl, fileBuffer, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/octet-stream',
                },
            });
            return assetUrn;
        }
        catch (err) {
            if (err instanceof types_1.ApiError)
                throw err;
            throw this.mapLinkedInError(err, 'Failed to upload media asset');
        }
    }
    async getPostAnalytics(token, postId) {
        try {
            const response = await axios_1.default.get(`${LINKEDIN_API_BASE}/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${this.organizationId}&shares=List(${encodeURIComponent(postId)})`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'X-Restli-Protocol-Version': '2.0.0',
                    'LinkedIn-Version': '202401',
                },
            });
            return response.data;
        }
        catch (err) {
            throw this.mapLinkedInError(err, 'Failed to fetch post analytics');
        }
    }
    // ── Error Handler ─────────────────────────────────────────────────────────────
    mapLinkedInError(err, context) {
        if (err instanceof types_1.ApiError)
            return err;
        const axiosErr = err;
        if (axiosErr.response) {
            const status = axiosErr.response.status;
            const data = axiosErr.response.data;
            const message = data?.message || data?.error || axiosErr.message;
            return new types_1.ApiError(status === 401 ? 401 : status === 403 ? 403 : 502, `${context}: ${message}`, `LINKEDIN_${status}`, data);
        }
        return new types_1.ApiError(502, `${context}: ${err.message}`, 'LINKEDIN_NETWORK_ERROR');
    }
}
exports.LinkedInService = LinkedInService;
