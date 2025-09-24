import * as THREE from 'three';
import { MapData, MapObject, MapObjectType } from './MapBuilder';

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  category: ValidationCategory;
  severity: ValidationSeverity;
  isRequired: boolean;
  validator: (mapData: MapData) => ValidationResult;
}

export type ValidationCategory = 
  | 'gameplay' 
  | 'performance' 
  | 'accessibility' 
  | 'quality' 
  | 'technical' 
  | 'balance';

export type ValidationSeverity = 'error' | 'warning' | 'info' | 'suggestion';

export interface ValidationResult {
  passed: boolean;
  message: string;
  details?: string;
  affectedObjects?: string[];
  suggestedFix?: string;
  score?: number; // 0-100
}

export interface MapValidationReport {
  mapId: string;
  mapName: string;
  validatedAt: number;
  overallScore: number;
  isPublishable: boolean;
  summary: {
    totalRules: number;
    passedRules: number;
    failedRules: number;
    errors: number;
    warnings: number;
    suggestions: number;
  };
  results: ValidationRuleResult[];
  recommendations: string[];
}

export interface ValidationRuleResult {
  rule: ValidationRule;
  result: ValidationResult;
  timestamp: number;
}

export interface MapQualityMetrics {
  playability: number;
  balance: number;
  performance: number;
  accessibility: number;
  creativity: number;
  technical: number;
  overall: number;
}

export interface ValidationOptions {
  enablePerformanceChecks?: boolean;
  enableAccessibilityChecks?: boolean;
  enableBalanceChecks?: boolean;
  strictMode?: boolean;
  targetPlayerCount?: number;
  maxValidationTime?: number;
}

export class MapValidator {
  private validationRules: Map<string, ValidationRule> = new Map();
  private options: Required<ValidationOptions>;
  private validationCallbacks: Map<string, Function[]> = new Map();

  constructor(options: ValidationOptions = {}) {
    this.options = {
      enablePerformanceChecks: options.enablePerformanceChecks !== false,
      enableAccessibilityChecks: options.enableAccessibilityChecks !== false,
      enableBalanceChecks: options.enableBalanceChecks !== false,
      strictMode: options.strictMode || false,
      targetPlayerCount: options.targetPlayerCount || 8,
      maxValidationTime: options.maxValidationTime || 30000 // 30 seconds
    };

    this.initializeDefaultRules();
  }

  // Rule management
  addValidationRule(rule: ValidationRule): void {
    this.validationRules.set(rule.id, rule);
    this.emitValidationEvent('rule_added', { rule });
  }

  removeValidationRule(ruleId: string): boolean {
    const removed = this.validationRules.delete(ruleId);
    if (removed) {
      this.emitValidationEvent('rule_removed', { ruleId });
    }
    return removed;
  }

  getValidationRule(ruleId: string): ValidationRule | null {
    return this.validationRules.get(ruleId) || null;
  }

  getAllValidationRules(): ValidationRule[] {
    return Array.from(this.validationRules.values());
  }

  getRulesByCategory(category: ValidationCategory): ValidationRule[] {
    return this.getAllValidationRules().filter(rule => rule.category === category);
  }

  // Map validation
  async validateMap(mapData: MapData): Promise<MapValidationReport> {
    const startTime = Date.now();
    
    this.emitValidationEvent('validation_started', { mapId: mapData.id });

    try {
      const results: ValidationRuleResult[] = [];
      const applicableRules = this.getApplicableRules(mapData);

      // Run validation rules
      for (const rule of applicableRules) {
        // Check timeout
        if (Date.now() - startTime > this.options.maxValidationTime) {
          break;
        }

        try {
          const result = rule.validator(mapData);
          results.push({
            rule,
            result,
            timestamp: Date.now()
          });
        } catch (error) {
          console.error(`Validation rule ${rule.id} failed:`, error);
          results.push({
            rule,
            result: {
              passed: false,
              message: 'Validation rule execution failed',
              details: error instanceof Error ? error.message : 'Unknown error'
            },
            timestamp: Date.now()
          });
        }
      }

      // Generate report
      const report = this.generateValidationReport(mapData, results);
      
      this.emitValidationEvent('validation_completed', { 
        mapId: mapData.id, 
        report 
      });

      return report;
    } catch (error) {
      console.error('Map validation failed:', error);
      
      // Return error report
      const errorReport: MapValidationReport = {
        mapId: mapData.id,
        mapName: mapData.name,
        validatedAt: Date.now(),
        overallScore: 0,
        isPublishable: false,
        summary: {
          totalRules: 0,
          passedRules: 0,
          failedRules: 1,
          errors: 1,
          warnings: 0,
          suggestions: 0
        },
        results: [],
        recommendations: ['Fix validation system errors before publishing']
      };

      this.emitValidationEvent('validation_failed', { 
        mapId: mapData.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });

      return errorReport;
    }
  }

  private getApplicableRules(mapData: MapData): ValidationRule[] {
    let rules = this.getAllValidationRules();

    // Filter based on options
    if (!this.options.enablePerformanceChecks) {
      rules = rules.filter(rule => rule.category !== 'performance');
    }

    if (!this.options.enableAccessibilityChecks) {
      rules = rules.filter(rule => rule.category !== 'accessibility');
    }

    if (!this.options.enableBalanceChecks) {
      rules = rules.filter(rule => rule.category !== 'balance');
    }

    // In strict mode, only run required rules
    if (this.options.strictMode) {
      rules = rules.filter(rule => rule.isRequired);
    }

    return rules;
  }

  private generateValidationReport(
    mapData: MapData, 
    results: ValidationRuleResult[]
  ): MapValidationReport {
    const summary = {
      totalRules: results.length,
      passedRules: results.filter(r => r.result.passed).length,
      failedRules: results.filter(r => !r.result.passed).length,
      errors: results.filter(r => !r.result.passed && r.rule.severity === 'error').length,
      warnings: results.filter(r => !r.result.passed && r.rule.severity === 'warning').length,
      suggestions: results.filter(r => !r.result.passed && r.rule.severity === 'suggestion').length
    };

    // Calculate overall score
    const totalPossibleScore = results.reduce((sum, r) => {
      return sum + (r.result.score !== undefined ? 100 : (r.result.passed ? 100 : 0));
    }, 0);

    const actualScore = results.reduce((sum, r) => {
      return sum + (r.result.score !== undefined ? r.result.score : (r.result.passed ? 100 : 0));
    }, 0);

    const overallScore = totalPossibleScore > 0 ? Math.round((actualScore / totalPossibleScore) * 100) : 0;

    // Determine if publishable
    const hasBlockingErrors = results.some(r => 
      !r.result.passed && r.rule.severity === 'error' && r.rule.isRequired
    );
    const isPublishable = !hasBlockingErrors && overallScore >= 60; // Minimum 60% score

    // Generate recommendations
    const recommendations = this.generateRecommendations(results);

    return {
      mapId: mapData.id,
      mapName: mapData.name,
      validatedAt: Date.now(),
      overallScore,
      isPublishable,
      summary,
      results,
      recommendations
    };
  }

  private generateRecommendations(results: ValidationRuleResult[]): string[] {
    const recommendations: string[] = [];
    
    // Add specific recommendations based on failed rules
    const failedResults = results.filter(r => !r.result.passed);
    
    for (const result of failedResults) {
      if (result.result.suggestedFix) {
        recommendations.push(result.result.suggestedFix);
      } else {
        recommendations.push(`Address ${result.rule.name}: ${result.result.message}`);
      }
    }

    // Add general recommendations
    const errorCount = results.filter(r => !r.result.passed && r.rule.severity === 'error').length;
    const warningCount = results.filter(r => !r.result.passed && r.rule.severity === 'warning').length;

    if (errorCount > 0) {
      recommendations.unshift(`Fix ${errorCount} critical error${errorCount > 1 ? 's' : ''} before publishing`);
    }

    if (warningCount > 3) {
      recommendations.push('Consider addressing warnings to improve map quality');
    }

    return recommendations.slice(0, 10); // Limit to 10 recommendations
  }

  // Quality metrics
  calculateQualityMetrics(mapData: MapData, validationReport: MapValidationReport): MapQualityMetrics {
    const categoryScores = this.calculateCategoryScores(validationReport);
    
    return {
      playability: categoryScores.gameplay || 0,
      balance: categoryScores.balance || 0,
      performance: categoryScores.performance || 0,
      accessibility: categoryScores.accessibility || 0,
      creativity: categoryScores.quality || 0,
      technical: categoryScores.technical || 0,
      overall: validationReport.overallScore
    };
  }

  private calculateCategoryScores(report: MapValidationReport): Record<ValidationCategory, number> {
    const categoryScores: Record<ValidationCategory, number> = {
      gameplay: 0,
      performance: 0,
      accessibility: 0,
      quality: 0,
      technical: 0,
      balance: 0
    };

    const categoryResults: Record<ValidationCategory, ValidationRuleResult[]> = {
      gameplay: [],
      performance: [],
      accessibility: [],
      quality: [],
      technical: [],
      balance: []
    };

    // Group results by category
    for (const result of report.results) {
      categoryResults[result.rule.category].push(result);
    }

    // Calculate average score for each category
    for (const [category, results] of Object.entries(categoryResults)) {
      if (results.length === 0) continue;

      const totalScore = results.reduce((sum, r) => {
        return sum + (r.result.score !== undefined ? r.result.score : (r.result.passed ? 100 : 0));
      }, 0);

      categoryScores[category as ValidationCategory] = Math.round(totalScore / results.length);
    }

    return categoryScores;
  }

  // Default validation rules
  private initializeDefaultRules(): void {
    const defaultRules: ValidationRule[] = [
      // Gameplay rules
      {
        id: 'spawn_points_required',
        name: 'Spawn Points Required',
        description: 'Map must have at least 2 spawn points',
        category: 'gameplay',
        severity: 'error',
        isRequired: true,
        validator: (mapData) => {
          const spawnPoints = mapData.objects.filter(obj => obj.type === 'spawn_point');
          const minRequired = Math.max(2, this.options.targetPlayerCount);
          
          return {
            passed: spawnPoints.length >= minRequired,
            message: spawnPoints.length >= minRequired 
              ? `Found ${spawnPoints.length} spawn points`
              : `Need at least ${minRequired} spawn points, found ${spawnPoints.length}`,
            affectedObjects: spawnPoints.map(sp => sp.id),
            suggestedFix: spawnPoints.length < minRequired 
              ? `Add ${minRequired - spawnPoints.length} more spawn points`
              : undefined,
            score: Math.min(100, (spawnPoints.length / minRequired) * 100)
          };
        }
      },

      {
        id: 'hiding_spots_balance',
        name: 'Hiding Spots Balance',
        description: 'Map should have adequate hiding spots for gameplay balance',
        category: 'balance',
        severity: 'warning',
        isRequired: false,
        validator: (mapData) => {
          const hidingSpots = mapData.objects.filter(obj => obj.type === 'hiding_spot');
          const recommendedCount = Math.ceil(this.options.targetPlayerCount * 1.5);
          
          return {
            passed: hidingSpots.length >= recommendedCount * 0.7, // 70% of recommended
            message: `Found ${hidingSpots.length} hiding spots (recommended: ${recommendedCount})`,
            affectedObjects: hidingSpots.map(hs => hs.id),
            suggestedFix: hidingSpots.length < recommendedCount 
              ? `Consider adding more hiding spots for better gameplay balance`
              : undefined,
            score: Math.min(100, (hidingSpots.length / recommendedCount) * 100)
          };
        }
      },

      {
        id: 'map_boundaries',
        name: 'Map Boundaries',
        description: 'Map must have clear boundaries to prevent players from escaping',
        category: 'gameplay',
        severity: 'error',
        isRequired: true,
        validator: (mapData) => {
          const boundaries = mapData.objects.filter(obj => obj.type === 'boundary');
          const walls = mapData.objects.filter(obj => obj.type === 'wall');
          const totalBoundaryObjects = boundaries.length + walls.length;
          
          return {
            passed: totalBoundaryObjects >= 4, // Minimum perimeter
            message: totalBoundaryObjects >= 4 
              ? 'Map has adequate boundaries'
              : 'Map needs more boundary objects to prevent escaping',
            affectedObjects: [...boundaries, ...walls].map(obj => obj.id),
            suggestedFix: totalBoundaryObjects < 4 
              ? 'Add walls or boundary objects around the map perimeter'
              : undefined,
            score: Math.min(100, (totalBoundaryObjects / 8) * 100) // Ideal: 8 boundary objects
          };
        }
      },

      // Performance rules
      {
        id: 'object_count_limit',
        name: 'Object Count Limit',
        description: 'Map should not exceed recommended object count for performance',
        category: 'performance',
        severity: 'warning',
        isRequired: false,
        validator: (mapData) => {
          const maxRecommended = 500;
          const objectCount = mapData.objects.length;
          
          return {
            passed: objectCount <= maxRecommended,
            message: `Map has ${objectCount} objects (recommended max: ${maxRecommended})`,
            details: objectCount > maxRecommended 
              ? 'High object count may impact performance on lower-end devices'
              : undefined,
            suggestedFix: objectCount > maxRecommended 
              ? 'Consider reducing object count or combining similar objects'
              : undefined,
            score: Math.max(0, 100 - ((objectCount - maxRecommended) / maxRecommended) * 100)
          };
        }
      },

      {
        id: 'complex_geometry_check',
        name: 'Complex Geometry Check',
        description: 'Avoid overly complex geometry that may impact performance',
        category: 'performance',
        severity: 'info',
        isRequired: false,
        validator: (mapData) => {
          const complexObjects = mapData.objects.filter(obj => 
            obj.scale.x > 10 || obj.scale.y > 10 || obj.scale.z > 10
          );
          
          return {
            passed: complexObjects.length <= 10,
            message: `Found ${complexObjects.length} potentially complex objects`,
            affectedObjects: complexObjects.map(obj => obj.id),
            suggestedFix: complexObjects.length > 10 
              ? 'Consider reducing scale of large objects or splitting them into smaller pieces'
              : undefined,
            score: Math.max(0, 100 - (complexObjects.length * 5))
          };
        }
      },

      // Quality rules
      {
        id: 'object_variety',
        name: 'Object Variety',
        description: 'Map should use a variety of object types for interesting gameplay',
        category: 'quality',
        severity: 'suggestion',
        isRequired: false,
        validator: (mapData) => {
          const uniqueTypes = new Set(mapData.objects.map(obj => obj.type));
          const varietyScore = Math.min(100, (uniqueTypes.size / 6) * 100); // 6 different types is good
          
          return {
            passed: uniqueTypes.size >= 3,
            message: `Map uses ${uniqueTypes.size} different object types`,
            suggestedFix: uniqueTypes.size < 3 
              ? 'Add more variety in object types (decorations, obstacles, etc.)'
              : undefined,
            score: varietyScore
          };
        }
      },

      // Accessibility rules
      {
        id: 'navigation_paths',
        name: 'Navigation Paths',
        description: 'Ensure players can navigate between all areas of the map',
        category: 'accessibility',
        severity: 'warning',
        isRequired: false,
        validator: (mapData) => {
          // Simplified check - in a real implementation, this would use pathfinding
          const floors = mapData.objects.filter(obj => obj.type === 'floor');
          const walls = mapData.objects.filter(obj => obj.type === 'wall');
          
          // Basic heuristic: ratio of floors to walls
          const ratio = floors.length > 0 ? walls.length / floors.length : 0;
          const isNavigable = ratio < 2; // Not too many walls relative to floors
          
          return {
            passed: isNavigable,
            message: isNavigable 
              ? 'Map appears to have good navigation paths'
              : 'Map may have navigation issues due to too many obstacles',
            suggestedFix: !isNavigable 
              ? 'Consider reducing walls or adding more floor space for better navigation'
              : undefined,
            score: isNavigable ? 100 : 50
          };
        }
      },

      // Technical rules
      {
        id: 'object_positioning',
        name: 'Object Positioning',
        description: 'Objects should be properly positioned within map boundaries',
        category: 'technical',
        severity: 'error',
        isRequired: true,
        validator: (mapData) => {
          const boundaries = mapData.settings.gameplay.boundaries;
          const outOfBounds = mapData.objects.filter(obj => 
            !boundaries.containsPoint(obj.position)
          );
          
          return {
            passed: outOfBounds.length === 0,
            message: outOfBounds.length === 0 
              ? 'All objects are within map boundaries'
              : `${outOfBounds.length} objects are outside map boundaries`,
            affectedObjects: outOfBounds.map(obj => obj.id),
            suggestedFix: outOfBounds.length > 0 
              ? 'Move objects back within the map boundaries'
              : undefined,
            score: Math.max(0, 100 - (outOfBounds.length * 10))
          };
        }
      }
    ];

    defaultRules.forEach(rule => this.addValidationRule(rule));
  }

  // Quick validation methods
  async quickValidate(mapData: MapData): Promise<{ isValid: boolean; criticalIssues: string[] }> {
    const requiredRules = this.getAllValidationRules().filter(rule => 
      rule.isRequired && rule.severity === 'error'
    );

    const criticalIssues: string[] = [];

    for (const rule of requiredRules) {
      try {
        const result = rule.validator(mapData);
        if (!result.passed) {
          criticalIssues.push(result.message);
        }
      } catch (error) {
        criticalIssues.push(`Validation error in ${rule.name}`);
      }
    }

    return {
      isValid: criticalIssues.length === 0,
      criticalIssues
    };
  }

  validateForPublishing(mapData: MapData): Promise<MapValidationReport> {
    // Use strict mode for publishing validation
    const originalStrictMode = this.options.strictMode;
    this.options.strictMode = true;

    const validationPromise = this.validateMap(mapData);
    
    // Restore original strict mode setting
    validationPromise.finally(() => {
      this.options.strictMode = originalStrictMode;
    });

    return validationPromise;
  }

  // Configuration
  updateOptions(newOptions: Partial<ValidationOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  getOptions(): ValidationOptions {
    return { ...this.options };
  }

  // Event system
  addEventListener(event: string, callback: Function): void {
    if (!this.validationCallbacks.has(event)) {
      this.validationCallbacks.set(event, []);
    }
    this.validationCallbacks.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    const callbacks = this.validationCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitValidationEvent(event: string, data: any): void {
    const callbacks = this.validationCallbacks.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Validation event callback error:', error);
      }
    });
  }

  // Cleanup
  dispose(): void {
    this.validationRules.clear();
    this.validationCallbacks.clear();
  }
}