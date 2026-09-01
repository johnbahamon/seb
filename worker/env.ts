export interface Env {
  readonly ASSETS: Fetcher;
  readonly IMAGES: R2Bucket;
  readonly SUPABASE_URL: string;
  /** Set with `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`. Never in config. */
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
}
