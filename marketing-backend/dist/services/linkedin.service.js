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
        // openid + profile: "Sign In with LinkedIn using OpenID Connect" (Default Tier, no approval)
        // w_member_social:  "Share on LinkedIn" (Default Tier, no approval)
        // Together they let us get the correct member sub from /v2/userinfo for posting.
        const scopes = ['openid', 'profile', 'w_member_social'].join(' ');
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
        // /v2/userinfo (OIDC) — returns sub when openid+profile scope is granted.
        // The sub here is the correct identifier for urn:li:member: posts.
        try {
            const response = await axios_1.default.get(`${LINKEDIN_API_BASE}/v2/userinfo`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const sub = response.data.sub;
            if (sub) {
                console.log(`[AUTH] person URN from userinfo sub: ${sub}`);
                return `urn:li:person:${sub}`;
            }
        }
        catch { /* fall through */ }
        // /v2/me — works when r_liteprofile scope is available (legacy fallback)
        try {
            const response = await axios_1.default.get(`${LINKEDIN_API_BASE}/v2/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'X-Restli-Protocol-Version': '2.0.0',
                },
            });
            const id = response.data.id;
            if (id) {
                console.log(`[AUTH] person URN from /v2/me: ${id}`);
                return `urn:li:person:${id}`;
            }
        }
        catch { /* fall through */ }
        // Token introspection fallback
        try {
            const intro = await axios_1.default.post(`${LINKEDIN_AUTH_BASE}/introspectToken`, new URLSearchParams({
                token,
                client_id: this.clientId,
                client_secret: this.clientSecret,
            }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            const d = intro.data;
            console.log(`[AUTH] introspection scope="${d.scope}" sub="${d.sub}"`);
            const sub = d.sub;
            if (sub)
                return `urn:li:person:${sub}`;
        }
        catch { /* fall through */ }
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
                    'LinkedIn-Version': '202604',
                    'X-Restli-Protocol-Version': '2.0.0',
                },
            });
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
            // Step 1: Initialize image upload via new REST images API
            const initResponse = await axios_1.default.post(`${LINKEDIN_API_BASE}/rest/images?action=initializeUpload`, { initializeUploadRequest: { owner: authorUrn } }, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'LinkedIn-Version': '202604',
                    'X-Restli-Protocol-Version': '2.0.0',
                },
            });
            const initData = initResponse.data;
            const uploadUrl = initData.value.uploadUrl;
            const imageUrn = initData.value.image;
            // Step 2: Fetch image data from URL (SSRF guard: https only)
            const parsedUrl = new URL(imageUrl);
            if (parsedUrl.protocol !== 'https:') {
                throw new types_1.ApiError(400, 'Image URL must use HTTPS', 'INVALID_URL');
            }
            const imageResponse = await axios_1.default.get(imageUrl, { responseType: 'arraybuffer', maxRedirects: 3 });
            const imageBuffer = Buffer.from(imageResponse.data);
            // Step 3: Upload image binary
            await axios_1.default.put(uploadUrl, imageBuffer, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/octet-stream',
                },
            });
            // Step 4: Create post with image via new REST posts API
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
                        id: imageUrn,
                    },
                },
                lifecycleState: 'PUBLISHED',
                isReshareDisabledByAuthor: false,
            };
            const postResponse = await axios_1.default.post(`${LINKEDIN_API_BASE}/rest/posts`, payload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'LinkedIn-Version': '202604',
                    'X-Restli-Protocol-Version': '2.0.0',
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
            const uploadDir = path_1.default.resolve(process.env.UPLOAD_DIR || path_1.default.join(process.cwd(), 'uploads'));
            if (!absolutePath.startsWith(uploadDir + path_1.default.sep)) {
                throw new types_1.ApiError(400, 'Invalid file path', 'INVALID_PATH');
            }
            if (!fs_1.default.existsSync(absolutePath)) {
                throw new types_1.ApiError(400, 'File not found', 'FILE_NOT_FOUND');
            }
            // Register upload via v2 assets API
            const registerResponse = await axios_1.default.post(`${LINKEDIN_API_BASE}/v2/assets?action=registerUpload`, {
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
            }, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0',
                },
            });
            const registerData = registerResponse.data;
            const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
            const assetUrn = registerData.value.asset;
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
            const response = await axios_1.default.get(`${LINKEDIN_API_BASE}/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${this.organizationId}&shares=List(${encodeURIComponent(postId)})`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'X-Restli-Protocol-Version': '2.0.0',
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
