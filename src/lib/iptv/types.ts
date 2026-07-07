/**
 * Xtream Codes API types and helpers.
 * Reference: https://github.com/xtreamui/ShakaCode (Xtream Codes protocol)
 */

export interface UserInfo {
  username: string
  password: string
  message: string
  auth: number
  status: string
  exp_date: string | null
  is_trial: string
  active_cons: string
  created_at: string
  max_connections: string
  allowed_output_formats: string[]
}

export interface AuthResponse {
  user_info: UserInfo
  server_info: {
    url: string
    port: string
    https_port: string
    server_protocol: string
    rtmp_port: string
    timezone: string
    timestamp_now: number
    time_now: string
  }
}

export interface Category {
  category_id: string
  category_name: string
  parent_id: number
}

export interface LiveStream {
  num: number
  name: string
  stream_type: string
  stream_id: number
  stream_icon: string
  epg_channel_id: string | null
  added: string
  category_id: string
  custom_sid: string
  tv_archive: number
  direct_source: string
  tv_archive_duration: number
}

export interface VodStream {
  num: number
  name: string
  stream_type: string
  stream_id: number
  stream_icon: string
  rating: string
  rating_5based: number
  added: string
  category_id: string
  container_extension: string
  custom_sid: string
  direct_source: string
}

export interface Series {
  num: number
  name: string
  series_id: number
  cover: string
  plot: string
  cast: string
  director: string
  genre: string
  releaseDate: string
  last_modified: string
  rating: string
  rating_5based: number
  category_id: string
}

export interface VodInfo {
  info: {
    movie_image: string
    tmdb_id?: string
    backdrop?: string
    backdrop_path?: string[]
    youtube_trailer?: string
    genre?: string
    plot?: string
    cast?: string
    rating?: string
    director?: string
    releasedate?: string
    duration?: string
    duration_secs?: number
  }
  movie_data: {
    stream_id: number
    name: string
    added: string
    category_id: string
    container_extension: string
    direct_source: string
  }
}

export interface SeriesInfoEpisode {
  id: string
  episode_num: string
  title: string
  container_extension: string
  info: {
    movie_image?: string
    plot?: string
    duration?: string
    rating?: string
    season?: number
    tmdb_id?: number
    cover_big?: string
    name?: string
  }
  added: string
  season: number
  direct_source: string
}

export interface SeriesInfo {
  seasons: Array<{
    season_number: number
    name: string
    cover: string
    overview: string
    air_date: string
    episode_count: number
  }>
  info: {
    name: string
    cover: string
    plot: string
    cast: string
    director: string
    genre: string
    releaseDate: string
    last_modified: string
    rating: string
    rating_5based: number
    backdrop_path: string[]
    youtube_trailer: string
    episode_run_time: string
    category_id: string
  }
  episodes: Record<string, SeriesInfoEpisode[]>
}

/** Build a stream URL for live channels. */
export function buildLiveStreamUrl(
  portal: string,
  username: string,
  password: string,
  streamId: number | string,
  ext: 'm3u8' | 'ts' = 'm3u8'
): string {
  return `${portal.replace(/\/+$/, '')}/live/${username}/${password}/${streamId}.${ext}`
}

/** Build a stream URL for VOD (movie) content. */
export function buildVodStreamUrl(
  portal: string,
  username: string,
  password: string,
  streamId: number | string,
  ext: string = 'mp4'
): string {
  return `${portal.replace(/\/+$/, '')}/movie/${username}/${password}/${streamId}.${ext}`
}

/** Build a stream URL for series episodes. */
export function buildSeriesStreamUrl(
  portal: string,
  username: string,
  password: string,
  episodeId: string,
  ext: string = 'mp4'
): string {
  return `${portal.replace(/\/+$/, '')}/series/${username}/${password}/${episodeId}.${ext}`
}

/**
 * Build the proxied stream URL — goes through our own /api/stream endpoint
 * to bypass CORS and Referrer restrictions enforced by the upstream portal.
 */
export function buildProxiedStreamUrl(rawUrl: string): string {
  return `/api/stream?url=${encodeURIComponent(rawUrl)}`
}

/**
 * Build a proxied HLS URL — routes through /api/hls which fetches the m3u8
 * and rewrites all segment URLs to also go through our proxy. Use this for
 * .m3u8 streams. Use buildProxiedStreamUrl for .ts / .mp4 / .mkv.
 */
export function buildProxiedHlsUrl(rawUrl: string): string {
  return `/api/hls?url=${encodeURIComponent(rawUrl)}`
}

/**
 * Build a proxied image URL for channel/VOD posters. Filters out invalid
 * icon values (some portals return "1" or empty strings instead of URLs).
 */
export function buildProxiedImageUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined
  // Some portals return "1" or invalid values for missing icons
  if (!/^https?:\/\//i.test(rawUrl)) return undefined
  return `/api/image?url=${encodeURIComponent(rawUrl)}`
}
