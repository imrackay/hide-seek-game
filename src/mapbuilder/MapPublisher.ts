import { MapData } from './MapBuilder';
import { MapValidator, MapValidationReport, MapQualityMetrics } from './MapValidator';

export interface PublishingOptions {
  enableCommunitySharing?: boolean;
  enableRating?: boolean;
  enableComments?: boolean;
  requireValidation?: boolean;
  moderationRequired?: boolean;
  maxMapSize?: number; // in MB
  allowedFileTypes?: string[];
}

export interface PublishedMap {
  id: string;
  mapData: MapData;
  publishedAt: number;
  publishedBy: string;
  status: PublishStatus;
  visibility: MapVisibility;
  validationReport?: MapValidationReport;
  qualityMetrics?: MapQualityMetrics;
  community: {
    downloads: number;
    rating: number;
    ratingCount: number;
    favorites: number;
    comments: MapComment[];
    reports: MapReport[];
  };
  moderation: {
    isApproved: boolean;
    moderatedAt?: number;
    moderatedBy?: string;
    moderationNotes?: string;
    rejectionReason?: string;
  };
  metadata: {
    fileSize: number;
    version: string;
    tags: string[];
    category: MapCategory;
    difficulty: 'easy' | 'medium' | 'hard' | 'expert';
    estimatedPlayTime: number;
    supportedGameModes: string[];
    thumbnailUrl?: string;
    screenshotUrls: string[];
  };
}

export type PublishStatus = 
  | 'draft' 
  | 'pending_validation' 
  | 'pending_moderation' 
  | 'published' 
  | 'rejected' 
  | 'archived' 
  | 'banned';

export type MapVisibility = 'public' | 'unlisted' | 'private' | 'friends_only';

export type MapCategory = 
  | 'classic' 
  | 'puzzle' 
  | 'action' 
  | 'creative' 
  | 'competitive' 
  | 'experimental' 
  | 'themed';

export interface MapComment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  rating?: number;
  createdAt: number;
  updatedAt?: number;
  isModerated: boolean;
  replies: MapCommentReply[];
}

export interface MapCommentReply {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: number;
  isModerated: boolean;
}

export interface MapReport {
  id: string;
  reportedBy: string;
  reason: ReportReason;
  description: string;
  createdAt: number;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  reviewedBy?: string;
  reviewedAt?: number;
  resolution?: string;
}

export type ReportReason = 
  | 'inappropriate_content' 
  | 'copyright_violation' 
  | 'broken_gameplay' 
  | 'performance_issues' 
  | 'spam' 
  | 'other';

export interface PublishingResult {
  success: boolean;
  publishedMap?: PublishedMap;
  error?: string;
  validationReport?: MapValidationReport;
  warnings?: string[];
}

export interface MapSearchFilters {
  category?: MapCategory;
  difficulty?: string[];
  tags?: string[];
  minRating?: number;
  maxPlayTime?: number;
  gameMode?: string;
  sortBy?: 'newest' | 'popular' | 'rating' | 'downloads';
  sortOrder?: 'asc' | 'desc';
}

export interface MapSearchResult {
  maps: PublishedMap[];
  totalCount: number;
  hasMore: boolean;
  filters: MapSearchFilters;
}

export class MapPublisher {
  private options: Required<PublishingOptions>;
  private validator: MapValidator;
  private publishedMaps: Map<string, PublishedMap> = new Map();
  private publishingCallbacks: Map<string, Function[]> = new Map();

  constructor(validator: MapValidator, options: PublishingOptions = {}) {
    this.validator = validator;
    this.options = {
      enableCommunitySharing: options.enableCommunitySharing !== false,
      enableRating: options.enableRating !== false,
      enableComments: options.enableComments !== false,
      requireValidation: options.requireValidation !== false,
      moderationRequired: options.moderationRequired !== false,
      maxMapSize: options.maxMapSize || 50, // 50MB default
      allowedFileTypes: options.allowedFileTypes || ['.json', '.map']
    };

    this.loadPublishedMaps();
  }

  // Publishing workflow
  async publishMap(
    mapData: MapData,
    publisherId: string,
    publishingSettings: {
      visibility?: MapVisibility;
      category?: MapCategory;
      tags?: string[];
      description?: string;
      screenshots?: string[];
    } = {}
  ): Promise<PublishingResult> {
    try {
      this.emitPublishingEvent('publish_started', { mapId: mapData.id, publisherId });

      // Step 1: Pre-publishing validation
      const preValidation = await this.prePublishValidation(mapData);
      if (!preValidation.success) {
        return preValidation;
      }

      // Step 2: Validate map if required
      let validationReport: MapValidationReport | undefined;
      if (this.options.requireValidation) {
        validationReport = await this.validator.validateForPublishing(mapData);
        
        if (!validationReport.isPublishable) {
          return {
            success: false,
            error: 'Map failed validation requirements',
            validationReport,
            warnings: validationReport.recommendations
          };
        }
      }

      // Step 3: Create published map entry
      const publishedMap = await this.createPublishedMap(
        mapData, 
        publisherId, 
        publishingSettings, 
        validationReport
      );

      // Step 4: Determine initial status
      publishedMap.status = this.determineInitialStatus(publishedMap);

      // Step 5: Store published map
      this.publishedMaps.set(publishedMap.id, publishedMap);
      await this.savePublishedMap(publishedMap);

      // Step 6: Post-publishing actions
      await this.postPublishingActions(publishedMap);

      this.emitPublishingEvent('map_published', { 
        publishedMap, 
        validationReport 
      });

      return {
        success: true,
        publishedMap,
        validationReport
      };

    } catch (error) {
      console.error('Map publishing failed:', error);
      
      this.emitPublishingEvent('publish_failed', { 
        mapId: mapData.id, 
        publisherId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });

      return {
        success: false,
        error: 'Publishing failed due to an internal error'
      };
    }
  }

  private async prePublishValidation(mapData: MapData): Promise<PublishingResult> {
    // Check map size
    const mapJson = JSON.stringify(mapData);
    const mapSizeKB = new Blob([mapJson]).size / 1024;
    const mapSizeMB = mapSizeKB / 1024;

    if (mapSizeMB > this.options.maxMapSize) {
      return {
        success: false,
        error: `Map size (${mapSizeMB.toFixed(2)}MB) exceeds maximum allowed size (${this.options.maxMapSize}MB)`
      };
    }

    // Check for required metadata
    if (!mapData.name || mapData.name.trim().length === 0) {
      return {
        success: false,
        error: 'Map must have a name'
      };
    }

    if (mapData.objects.length === 0) {
      return {
        success: false,
        error: 'Map cannot be empty'
      };
    }

    // Quick validation for critical issues
    const quickValidation = await this.validator.quickValidate(mapData);
    if (!quickValidation.isValid) {
      return {
        success: false,
        error: 'Map has critical validation issues',
        warnings: quickValidation.criticalIssues
      };
    }

    return { success: true };
  }

  private async createPublishedMap(
    mapData: MapData,
    publisherId: string,
    settings: any,
    validationReport?: MapValidationReport
  ): Promise<PublishedMap> {
    const now = Date.now();
    const mapJson = JSON.stringify(mapData);
    const fileSize = new Blob([mapJson]).size;

    const publishedMap: PublishedMap = {
      id: `pub_${mapData.id}_${now}`,
      mapData: { ...mapData },
      publishedAt: now,
      publishedBy: publisherId,
      status: 'draft',
      visibility: settings.visibility || 'public',
      validationReport,
      qualityMetrics: validationReport ? 
        this.validator.calculateQualityMetrics(mapData, validationReport) : undefined,
      community: {
        downloads: 0,
        rating: 0,
        ratingCount: 0,
        favorites: 0,
        comments: [],
        reports: []
      },
      moderation: {
        isApproved: false
      },
      metadata: {
        fileSize,
        version: mapData.version,
        tags: settings.tags || [],
        category: settings.category || 'classic',
        difficulty: mapData.metadata.difficulty,
        estimatedPlayTime: mapData.metadata.estimatedPlayTime,
        supportedGameModes: mapData.settings.gameplay.gameMode,
        screenshotUrls: settings.screenshots || []
      }
    };

    return publishedMap;
  }

  private determineInitialStatus(publishedMap: PublishedMap): PublishStatus {
    if (this.options.moderationRequired) {
      return 'pending_moderation';
    }

    if (this.options.requireValidation && !publishedMap.validationReport?.isPublishable) {
      return 'pending_validation';
    }

    return 'published';
  }

  private async postPublishingActions(publishedMap: PublishedMap): Promise<void> {
    // Generate thumbnail if not provided
    if (!publishedMap.metadata.thumbnailUrl) {
      publishedMap.metadata.thumbnailUrl = await this.generateThumbnail(publishedMap.mapData);
    }

    // Auto-tag based on content analysis
    const autoTags = this.analyzeMapContent(publishedMap.mapData);
    publishedMap.metadata.tags = [...new Set([...publishedMap.metadata.tags, ...autoTags])];

    // Notify moderators if moderation required
    if (this.options.moderationRequired && publishedMap.status === 'pending_moderation') {
      this.notifyModerators(publishedMap);
    }
  }

  private async generateThumbnail(mapData: MapData): Promise<string> {
    // In a real implementation, this would render the map and create a thumbnail
    // For now, return a placeholder
    return `thumbnail_${mapData.id}.jpg`;
  }

  private analyzeMapContent(mapData: MapData): string[] {
    const tags: string[] = [];
    
    // Analyze object types
    const objectTypes = new Set(mapData.objects.map(obj => obj.type));
    
    if (objectTypes.has('light')) tags.push('illuminated');
    if (objectTypes.has('trigger')) tags.push('interactive');
    if (mapData.objects.filter(obj => obj.type === 'hiding_spot').length > 10) {
      tags.push('many-hiding-spots');
    }
    if (mapData.objects.filter(obj => obj.type === 'obstacle').length > 20) {
      tags.push('obstacle-course');
    }

    // Analyze map size
    const bounds = mapData.settings.gameplay.boundaries;
    const mapSize = bounds.getSize(new THREE.Vector3());
    const area = mapSize.x * mapSize.z;
    
    if (area > 5000) tags.push('large');
    else if (area < 1000) tags.push('small');
    else tags.push('medium');

    // Analyze complexity
    if (mapData.objects.length > 100) tags.push('complex');
    if (mapData.objects.length < 20) tags.push('simple');

    return tags;
  }

  private notifyModerators(publishedMap: PublishedMap): void {
    // In a real implementation, this would send notifications to moderators
    this.emitPublishingEvent('moderation_required', { publishedMap });
  }

  // Map management
  async updateMapStatus(mapId: string, newStatus: PublishStatus, moderatorId?: string): Promise<boolean> {
    const publishedMap = this.publishedMaps.get(mapId);
    if (!publishedMap) return false;

    const oldStatus = publishedMap.status;
    publishedMap.status = newStatus;

    // Update moderation info if applicable
    if (moderatorId && (newStatus === 'published' || newStatus === 'rejected')) {
      publishedMap.moderation.moderatedAt = Date.now();
      publishedMap.moderation.moderatedBy = moderatorId;
      publishedMap.moderation.isApproved = newStatus === 'published';
    }

    await this.savePublishedMap(publishedMap);
    
    this.emitPublishingEvent('map_status_updated', { 
      mapId, 
      oldStatus, 
      newStatus, 
      moderatorId 
    });

    return true;
  }

  async unpublishMap(mapId: string, reason?: string): Promise<boolean> {
    const publishedMap = this.publishedMaps.get(mapId);
    if (!publishedMap) return false;

    publishedMap.status = 'archived';
    if (reason) {
      publishedMap.moderation.rejectionReason = reason;
    }

    await this.savePublishedMap(publishedMap);
    
    this.emitPublishingEvent('map_unpublished', { mapId, reason });

    return true;
  }

  // Community features
  async rateMap(mapId: string, userId: string, rating: number): Promise<boolean> {
    if (!this.options.enableRating) return false;
    if (rating < 1 || rating > 5) return false;

    const publishedMap = this.publishedMaps.get(mapId);
    if (!publishedMap || publishedMap.status !== 'published') return false;

    // In a real implementation, this would check for existing ratings by the user
    // and update accordingly. For now, we'll just update the aggregate.
    
    const currentTotal = publishedMap.community.rating * publishedMap.community.ratingCount;
    publishedMap.community.ratingCount++;
    publishedMap.community.rating = (currentTotal + rating) / publishedMap.community.ratingCount;

    await this.savePublishedMap(publishedMap);
    
    this.emitPublishingEvent('map_rated', { mapId, userId, rating });

    return true;
  }

  async addComment(
    mapId: string, 
    userId: string, 
    userName: string, 
    content: string, 
    rating?: number
  ): Promise<MapComment | null> {
    if (!this.options.enableComments) return null;

    const publishedMap = this.publishedMaps.get(mapId);
    if (!publishedMap || publishedMap.status !== 'published') return null;

    const comment: MapComment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      userName,
      content: content.trim(),
      rating,
      createdAt: Date.now(),
      isModerated: false,
      replies: []
    };

    publishedMap.community.comments.push(comment);
    await this.savePublishedMap(publishedMap);
    
    this.emitPublishingEvent('comment_added', { mapId, comment });

    return comment;
  }

  async reportMap(
    mapId: string, 
    reportedBy: string, 
    reason: ReportReason, 
    description: string
  ): Promise<MapReport | null> {
    const publishedMap = this.publishedMaps.get(mapId);
    if (!publishedMap) return null;

    const report: MapReport = {
      id: `report_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      reportedBy,
      reason,
      description: description.trim(),
      createdAt: Date.now(),
      status: 'pending'
    };

    publishedMap.community.reports.push(report);
    await this.savePublishedMap(publishedMap);
    
    this.emitPublishingEvent('map_reported', { mapId, report });

    return report;
  }

  // Search and discovery
  searchMaps(
    query?: string, 
    filters: MapSearchFilters = {}, 
    limit = 20, 
    offset = 0
  ): MapSearchResult {
    let maps = Array.from(this.publishedMaps.values())
      .filter(map => map.status === 'published');

    // Apply text search
    if (query && query.trim()) {
      const searchTerm = query.toLowerCase();
      maps = maps.filter(map => 
        map.mapData.name.toLowerCase().includes(searchTerm) ||
        map.mapData.description.toLowerCase().includes(searchTerm) ||
        map.metadata.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    // Apply filters
    if (filters.category) {
      maps = maps.filter(map => map.metadata.category === filters.category);
    }

    if (filters.difficulty && filters.difficulty.length > 0) {
      maps = maps.filter(map => filters.difficulty!.includes(map.metadata.difficulty));
    }

    if (filters.tags && filters.tags.length > 0) {
      maps = maps.filter(map => 
        filters.tags!.some(tag => map.metadata.tags.includes(tag))
      );
    }

    if (filters.minRating) {
      maps = maps.filter(map => map.community.rating >= filters.minRating!);
    }

    if (filters.maxPlayTime) {
      maps = maps.filter(map => map.metadata.estimatedPlayTime <= filters.maxPlayTime!);
    }

    if (filters.gameMode) {
      maps = maps.filter(map => 
        map.metadata.supportedGameModes.includes(filters.gameMode!)
      );
    }

    // Apply sorting
    const sortBy = filters.sortBy || 'newest';
    const sortOrder = filters.sortOrder || 'desc';

    maps.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'newest':
          comparison = a.publishedAt - b.publishedAt;
          break;
        case 'popular':
          comparison = a.community.downloads - b.community.downloads;
          break;
        case 'rating':
          comparison = a.community.rating - b.community.rating;
          break;
        case 'downloads':
          comparison = a.community.downloads - b.community.downloads;
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Apply pagination
    const totalCount = maps.length;
    const paginatedMaps = maps.slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;

    return {
      maps: paginatedMaps,
      totalCount,
      hasMore,
      filters
    };
  }

  getFeaturedMaps(limit = 10): PublishedMap[] {
    return Array.from(this.publishedMaps.values())
      .filter(map => map.status === 'published')
      .sort((a, b) => {
        // Featured maps are sorted by a combination of rating and popularity
        const scoreA = (a.community.rating * 0.7) + (Math.log(a.community.downloads + 1) * 0.3);
        const scoreB = (b.community.rating * 0.7) + (Math.log(b.community.downloads + 1) * 0.3);
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  getPopularTags(limit = 20): { tag: string; count: number }[] {
    const tagCounts = new Map<string, number>();

    for (const map of this.publishedMaps.values()) {
      if (map.status === 'published') {
        for (const tag of map.metadata.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
    }

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // Data management
  getPublishedMap(mapId: string): PublishedMap | null {
    return this.publishedMaps.get(mapId) || null;
  }

  getMapsByPublisher(publisherId: string): PublishedMap[] {
    return Array.from(this.publishedMaps.values())
      .filter(map => map.publishedBy === publisherId);
  }

  async downloadMap(mapId: string): Promise<MapData | null> {
    const publishedMap = this.publishedMaps.get(mapId);
    if (!publishedMap || publishedMap.status !== 'published') {
      return null;
    }

    // Increment download count
    publishedMap.community.downloads++;
    await this.savePublishedMap(publishedMap);

    this.emitPublishingEvent('map_downloaded', { mapId });

    return { ...publishedMap.mapData };
  }

  // Storage
  private loadPublishedMaps(): void {
    try {
      const stored = localStorage.getItem('publishedMaps');
      if (stored) {
        const mapsData = JSON.parse(stored);
        for (const [id, mapData] of Object.entries(mapsData)) {
          this.publishedMaps.set(id, mapData as PublishedMap);
        }
      }
    } catch (error) {
      console.error('Failed to load published maps:', error);
    }
  }

  private async savePublishedMap(publishedMap: PublishedMap): Promise<void> {
    try {
      // Save individual map
      localStorage.setItem(`publishedMap_${publishedMap.id}`, JSON.stringify(publishedMap));
      
      // Update index
      const allMaps = Object.fromEntries(this.publishedMaps.entries());
      localStorage.setItem('publishedMaps', JSON.stringify(allMaps));
    } catch (error) {
      console.error('Failed to save published map:', error);
      throw error;
    }
  }

  // Statistics
  getPublishingStatistics(): {
    totalMaps: number;
    publishedMaps: number;
    pendingMaps: number;
    totalDownloads: number;
    averageRating: number;
    topCategories: { category: MapCategory; count: number }[];
  } {
    const maps = Array.from(this.publishedMaps.values());
    
    const totalMaps = maps.length;
    const publishedMaps = maps.filter(m => m.status === 'published').length;
    const pendingMaps = maps.filter(m => 
      m.status === 'pending_validation' || m.status === 'pending_moderation'
    ).length;
    
    const totalDownloads = maps.reduce((sum, m) => sum + m.community.downloads, 0);
    
    const ratedMaps = maps.filter(m => m.community.ratingCount > 0);
    const averageRating = ratedMaps.length > 0 
      ? ratedMaps.reduce((sum, m) => sum + m.community.rating, 0) / ratedMaps.length
      : 0;

    const categoryCounts = new Map<MapCategory, number>();
    for (const map of maps) {
      if (map.status === 'published') {
        categoryCounts.set(map.metadata.category, (categoryCounts.get(map.metadata.category) || 0) + 1);
      }
    }

    const topCategories = Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalMaps,
      publishedMaps,
      pendingMaps,
      totalDownloads,
      averageRating,
      topCategories
    };
  }

  // Configuration
  updateOptions(newOptions: Partial<PublishingOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  getOptions(): PublishingOptions {
    return { ...this.options };
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.publishingCallbacks.has(event)) {
      this.publishingCallbacks.set(event, []);
    }
    this.publishingCallbacks.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const callbacks = this.publishingCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitPublishingEvent(event: string, data: any): void {
    const callbacks = this.publishingCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Publishing event callback error:', error);
      }
    });
  }

  // Cleanup
  dispose(): void {
    this.publishedMaps.clear();
    this.publishingCallbacks.clear();
  }
}