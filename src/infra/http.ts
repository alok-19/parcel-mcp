import robotsParser from "robots-parser";
import { logger } from "./logger.js";

const userAgents = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
];

interface RobotsPolicy {
  isAllowed(url: string, ua?: string): boolean | undefined;
}

const robotsCache = new Map<string, RobotsPolicy>();
const concurrencyState = new Map<string, number>();
const parseRobots = robotsParser as unknown as (url: string, body: string) => RobotsPolicy;

/**
 * Error raised when a carrier robots policy disallows scraping a path.
 */
export class RobotsDisallowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RobotsDisallowedError";
  }
}

/**
 * Shared HTTP response shape returned to carrier adapters.
 */
export interface HttpResponse {
  status: number;
  body: string;
  url: string;
  headers: Headers;
}

/**
 * Small helper for polite carrier scraping in Phase 1.
 */
export class HttpClient {
  private readonly maxConcurrencyPerHost = 2;

  /**
   * Fetches a page with timeout, retry, UA rotation, robots awareness, and jitter.
   */
  async fetchText(
    url: string,
    options: {
      method?: "GET" | "POST";
      headers?: Record<string, string>;
      body?: string;
    } = {}
  ): Promise<HttpResponse> {
    const target = new URL(url);
    await this.ensureRobotsAllowed(target);
    await this.acquireHostSlot(target.host);
    await this.sleep(1_000 + Math.floor(Math.random() * 200));

    const attempts = [1, 2];
    try {
      for (const attempt of attempts) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15_000);
          const headers: Record<string, string> = {
            "user-agent": userAgents[(attempt - 1) % userAgents.length]!,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            ...options.headers
          };
          if (options.body) {
            headers["content-type"] = "application/x-www-form-urlencoded";
          }

          const response = await fetch(target, {
            method: options.method ?? "GET",
            headers,
            ...(options.body ? { body: options.body } : {}),
            redirect: "follow",
            signal: controller.signal
          });
          clearTimeout(timer);
          const body = await response.text();

          return {
            status: response.status,
            body,
            url: response.url,
            headers: response.headers
          };
        } catch (error) {
          if (attempt === attempts.length) {
            throw error;
          }

          logger.warn({ err: error, url }, "Retrying carrier fetch after transient error");
          await this.sleep(400);
        }
      }

      throw new Error("Unexpected fetch flow");
    } finally {
      this.releaseHostSlot(target.host);
    }
  }

  /**
   * Best-effort robots fetch and policy evaluation.
   */
  private async ensureRobotsAllowed(target: URL): Promise<void> {
    const robotsUrl = `${target.protocol}//${target.host}/robots.txt`;
    let parser = robotsCache.get(robotsUrl);

    if (!parser) {
      try {
        const response = await fetch(robotsUrl, {
          headers: { "user-agent": userAgents[0]! }
        });
        const body = response.ok ? await response.text() : "";
        parser = parseRobots(robotsUrl, body);
      } catch (error) {
        logger.warn({ err: error, robotsUrl }, "Unable to fetch robots.txt, proceeding conservatively");
        parser = parseRobots(robotsUrl, "");
      }

      robotsCache.set(robotsUrl, parser);
    }

    const resolvedParser = parser ?? parseRobots(robotsUrl, "");
    robotsCache.set(robotsUrl, resolvedParser);

    if (!resolvedParser.isAllowed(target.toString(), userAgents[0]!)) {
      throw new RobotsDisallowedError(`Robots policy disallows ${target.pathname}`);
    }
  }

  /**
   * Waits until a per-host concurrency slot becomes available.
   */
  private async acquireHostSlot(host: string): Promise<void> {
    while ((concurrencyState.get(host) ?? 0) >= this.maxConcurrencyPerHost) {
      await this.sleep(50);
    }

    concurrencyState.set(host, (concurrencyState.get(host) ?? 0) + 1);
  }

  /**
   * Releases a previously acquired host slot.
   */
  private releaseHostSlot(host: string): void {
    const next = Math.max((concurrencyState.get(host) ?? 1) - 1, 0);
    concurrencyState.set(host, next);
  }

  /**
   * Sleep helper.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Shared HTTP client singleton.
 */
export const httpClient = new HttpClient();
