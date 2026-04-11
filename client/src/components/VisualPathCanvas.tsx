import { useState, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Move, Trash2, Settings, Save, Download, ArrowRight, Star, Zap, Award } from "lucide-react";
import { SiNike, SiAdidas, SiJordan, SiPuma, SiNewbalance } from "react-icons/si";
import { FaRunning, FaDumbbell, FaBasketballBall, FaFutbol } from "react-icons/fa";
import { GiConverseShoe, GiShinyEntrance } from "react-icons/gi";
import type { Product } from "@shared/schema";

interface CanvasNode {
  id: string;
  type: 'category' | 'brand' | 'style' | 'color' | 'size' | 'action' | 'brand_selector';
  value: string; // The actual value like "Basketball", "Adidas"
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  connections: string[]; // Connected node IDs
  parentId?: string; // For branching
  availableOptions?: string[]; // For selector nodes
  selectedOptions?: string[]; // For selector nodes
  filterQuery?: string; // For search in selector nodes
}

interface CanvasConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

interface ToolbarOption {
  type: 'category' | 'brand' | 'style' | 'color';
  value: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface VisualPathCanvasProps {
  onPathsChange?: (paths: CanvasNode[]) => void;
}

export function VisualPathCanvas({ onPathsChange }: VisualPathCanvasProps) {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [connections, setConnections] = useState<CanvasConnection[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const [draggedOption, setDraggedOption] = useState<ToolbarOption | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  
  // Get all products for building options
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });
  
  // Get brand icon for a given brand name
  const getBrandIcon = (brandName: string): React.ReactNode => {
    const brand = brandName.toLowerCase();
    switch (brand) {
      case 'nike': return <SiNike className="w-4 h-4" />;
      case 'adidas': return <SiAdidas className="w-4 h-4" />;
      case 'jordan': return <SiJordan className="w-4 h-4" />;
      case 'puma': return <SiPuma className="w-4 h-4" />;
      case 'new balance': return <SiNewbalance className="w-4 h-4" />;
      case 'converse': return <GiConverseShoe className="w-4 h-4" />;
      case 'vans': return <FaDumbbell className="w-4 h-4" />;
      case 'johnston & murphy': return <GiShinyEntrance className="w-4 h-4" />;
      default: return <Award className="w-4 h-4" />;
    }
  };
  
  // Get category icon for a given category name
  const getCategoryIcon = (categoryName: string): React.ReactNode => {
    const category = categoryName.toLowerCase();
    if (category.includes('athletic') || category.includes('running')) return <FaRunning className="w-4 h-4" />;
    if (category.includes('basketball')) return <FaBasketballBall className="w-4 h-4" />;
    if (category.includes('sneaker')) return <GiConverseShoe className="w-4 h-4" />;
    if (category.includes('formal')) return <GiShinyEntrance className="w-4 h-4" />;
    return <GiConverseShoe className="w-4 h-4" />;
  };

  // Node templates for different decision types
  const nodeTemplates = {
    category: { width: 120, height: 60, color: '#3b82f6' }, // Blue
    brand: { width: 120, height: 60, color: '#10b981' },    // Green  
    brand_selector: { width: 160, height: 80, color: '#059669' }, // Dark Green
    style: { width: 160, height: 60, color: '#8b5cf6' },    // Purple
    color: { width: 100, height: 60, color: '#ec4899' },     // Pink
    size: { width: 80, height: 60, color: '#f97316' },      // Orange
    action: { width: 120, height: 60, color: '#64748b' }    // Gray
  };
  
  // Get path from root to a node (for context)
  const getNodePath = useCallback((node: CanvasNode): CanvasNode[] => {
    const path: CanvasNode[] = [];
    let current: CanvasNode | undefined = node;
    
    while (current) {
      path.unshift(current);
      if (current.parentId) {
        current = nodes.find(n => n.id === current!.parentId);
      } else {
        break;
      }
    }
    
    return path;
  }, [nodes]);
  
  // Get available options based on current selection context
  const availableOptions = useMemo((): ToolbarOption[] => {
    const options: ToolbarOption[] = [];
    
    // Always show all categories for starting new flows or branching
    const categories = Array.from(new Set(allProducts.map(p => p.category)));
    categories.forEach(cat => {
      const count = allProducts.filter(p => p.category === cat).length;
      options.push({ 
        type: 'category', 
        value: cat, 
        label: cat, 
        count,
        icon: getCategoryIcon(cat)
      });
    });
    
    // If we have nodes, also show contextual options
    if (nodes.length > 0) {
      const contextNode = selectedNode ? nodes.find(n => n.id === selectedNode) : nodes[nodes.length - 1];
      if (contextNode) {
        const path = getNodePath(contextNode);
        const currentCategory = path.find(n => n.type === 'category')?.value;
        const currentBrand = path.find(n => n.type === 'brand')?.value;
        
        // Show brands for the selected category if not already auto-created
        if (currentCategory && !currentBrand) {
          const brands = Array.from(new Set(
            allProducts.filter(p => p.category === currentCategory).map(p => p.brand)
          ));
          brands.forEach(brand => {
            if (!options.find(o => o.value === brand && o.type === 'brand')) {
              const count = allProducts.filter(p => p.category === currentCategory && p.brand === brand).length;
              options.push({ 
                type: 'brand', 
                value: brand, 
                label: brand, 
                count,
                icon: getBrandIcon(brand)
              });
            }
          });
        }
        
        // Show styles/products for selected category + brand
        if (currentCategory && currentBrand) {
          const products = allProducts.filter(p => 
            p.category === currentCategory && p.brand === currentBrand
          );
          products.forEach(product => {
            if (!options.find(o => o.value === product.sku)) {
              options.push({ 
                type: 'style', 
                value: product.sku, 
                label: product.name,
                icon: <Star className="w-4 h-4" />
              });
            }
          });
        }
      }
    }
    
    return options;
  }, [allProducts, nodes, selectedNode, getNodePath]);

  // Add new node to canvas
  const addNodeFromOption = (option: ToolbarOption, x: number, y: number, parentId?: string): string => {
    const template = nodeTemplates[option.type];
    const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNode: CanvasNode = {
      id: nodeId,
      type: option.type,
      value: option.value,
      label: option.label,
      x,
      y,
      width: template.width,
      height: template.height,
      color: template.color,
      connections: [],
      parentId
    };
    
    setNodes(prev => {
      const newNodes = [...prev, newNode];
      
      // Create connection if there's a parent
      if (parentId) {
        const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setConnections(prevConn => [...prevConn, {
          id: connectionId,
          fromNodeId: parentId,
          toNodeId: newNode.id
        }]);
      }
      
      // Notify after state update
      setTimeout(() => onPathsChange?.(newNodes), 0);
      return newNodes;
    });
    
    return nodeId;
  };
  
  // Add brand selector node with available brands
  const addBrandSelectorNode = (option: ToolbarOption, x: number, y: number, parentId: string, availableBrands: string[]): string => {
    const template = nodeTemplates.brand_selector;
    const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNode: CanvasNode = {
      id: nodeId,
      type: 'brand_selector',
      value: 'brand_selector',
      label: 'Select Brands',
      x,
      y,
      width: template.width,
      height: template.height,
      color: template.color,
      connections: [],
      parentId,
      availableOptions: availableBrands,
      selectedOptions: []
    };
    
    setNodes(prev => {
      const newNodes = [...prev, newNode];
      
      // Create connection to parent
      const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setConnections(prevConn => [...prevConn, {
        id: connectionId,
        fromNodeId: parentId,
        toNodeId: newNode.id
      }]);
      
      // Notify after state update
      setTimeout(() => onPathsChange?.(newNodes), 0);
      return newNodes;
    });
    
    return nodeId;
  };
  
  // Handle brand selection in selector node
  const handleBrandSelection = (nodeId: string, brand: string, isSelected: boolean) => {
    setNodes(prev => prev.map(node => {
      if (node.id === nodeId && node.type === 'brand_selector') {
        const selectedOptions = isSelected 
          ? [...(node.selectedOptions || []), brand]
          : (node.selectedOptions || []).filter(b => b !== brand);
        return { ...node, selectedOptions };
      }
      return node;
    }));
  };
  
  // Handle filter query change in selector node
  const handleFilterQueryChange = (nodeId: string, query: string) => {
    setNodes(prev => prev.map(node => {
      if (node.id === nodeId && node.type === 'brand_selector') {
        return { ...node, filterQuery: query };
      }
      return node;
    }));
  };
  
  // Create brand nodes from selected brands in selector
  const createSelectedBrands = (selectorNode: CanvasNode) => {
    if (!selectorNode.selectedOptions || selectorNode.selectedOptions.length === 0) return;
    
    const categoryNode = nodes.find(n => n.id === selectorNode.parentId);
    if (!categoryNode) return;
    
    // Batch create all brand nodes and connections
    const newBrandNodes: CanvasNode[] = [];
    const newConnections: CanvasConnection[] = [];
    
    selectorNode.selectedOptions.forEach((brand, index) => {
      const template = nodeTemplates.brand;
      const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${index}`;
      
      const brandNode: CanvasNode = {
        id: nodeId,
        type: 'brand',
        value: brand,
        label: brand,
        x: selectorNode.x + 180,
        y: selectorNode.y + (index * 90) - ((selectorNode.selectedOptions!.length - 1) * 45),
        width: template.width,
        height: template.height,
        color: template.color,
        connections: [],
        parentId: selectorNode.id
      };
      
      newBrandNodes.push(brandNode);
      
      // Create connection
      newConnections.push({
        id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${index}`,
        fromNodeId: selectorNode.id,
        toNodeId: nodeId
      });
    });
    
    // Batch update state
    setNodes(prev => [...prev, ...newBrandNodes]);
    setConnections(prev => [...prev, ...newConnections]);
    
    // Single notification after batch
    setTimeout(() => onPathsChange?.(nodes.concat(newBrandNodes)), 0);
  };

  // Handle option drag start from toolbar
  const handleOptionDragStart = (option: ToolbarOption, e: React.DragEvent) => {
    setDraggedOption(option);
    e.dataTransfer.effectAllowed = 'copy';
  };
  
  // Handle drop on canvas
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedOption || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if dropping on an existing node for branching
    const targetNode = nodes.find(node => 
      x >= node.x && x <= node.x + node.width &&
      y >= node.y && y <= node.y + node.height
    );
    
    if (targetNode) {
      // Branch from existing node
      const offsetX = targetNode.width + 20;
      const offsetY = Math.random() * 60 - 30; // Some vertical offset
      
      if (draggedOption.type === 'category') {
        // Create category node first, then brand selector
        const categoryNodeId = addNodeFromOption(draggedOption, targetNode.x + offsetX, targetNode.y + offsetY, targetNode.id);
        
        // Create brand selector connected to the new category
        setTimeout(() => {
          const availableBrands = Array.from(new Set(
            allProducts.filter(p => p.category === draggedOption.value).map(p => p.brand)
          ));
          
          const selectorX = targetNode.x + offsetX + 180;
          const selectorY = targetNode.y + offsetY;
          
          addBrandSelectorNode({
            type: 'brand',
            value: 'brand_selector',
            label: 'Select Brands'
          }, selectorX, selectorY, categoryNodeId, availableBrands);
        }, 200);
      } else {
        addNodeFromOption(draggedOption, targetNode.x + offsetX, targetNode.y + offsetY, targetNode.id);
      }
    } else {
      // Add as new root - if it's a category, auto-create connected brands
      const mainNodeX = x - 60;
      const mainNodeY = y - 30;
      
      if (draggedOption.type === 'category') {
        // Create the category node first and get its ID
        const categoryNodeId = addNodeFromOption(draggedOption, mainNodeX, mainNodeY);
        
        // Create a brand selector node connected to the category
        setTimeout(() => {
          const availableBrands = Array.from(new Set(
            allProducts.filter(p => p.category === draggedOption.value).map(p => p.brand)
          ));
          
          const selectorOption: ToolbarOption = {
            type: 'brand',
            value: 'brand_selector',
            label: 'Select Brands'
          };
          
          const selectorX = mainNodeX + 180;
          const selectorY = mainNodeY;
          
          // Create brand selector node
          const selectorNodeId = addBrandSelectorNode(selectorOption, selectorX, selectorY, categoryNodeId, availableBrands);
        }, 200);
      } else {
        // Add single node for non-category types
        addNodeFromOption(draggedOption, mainNodeX, mainNodeY);
      }
    }
    
    setDraggedOption(null);
  };
  
  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  
  // Handle node drag start
  const handleMouseDown = (nodeId: string, e: React.MouseEvent) => {
    if (isConnecting) {
      if (!connectionStart) {
        setConnectionStart(nodeId);
      } else if (connectionStart !== nodeId) {
        // Create connection
        const newConnection: CanvasConnection = {
          id: `conn-${Date.now()}`,
          fromNodeId: connectionStart,
          toNodeId: nodeId
        };
        setConnections(prev => [...prev, newConnection]);
        setConnectionStart(null);
        setIsConnecting(false);
      }
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setDraggedNode(nodeId);
      setDragOffset({
        x: e.clientX - rect.left - nodes.find(n => n.id === nodeId)!.x,
        y: e.clientY - rect.top - nodes.find(n => n.id === nodeId)!.y
      });
    }
    setSelectedNode(nodeId);
  };

  // Handle node drag
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggedNode || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const newX = e.clientX - rect.left - dragOffset.x;
    const newY = e.clientY - rect.top - dragOffset.y;

    setNodes(prev => prev.map(node => 
      node.id === draggedNode 
        ? { ...node, x: Math.max(0, newX), y: Math.max(0, newY) }
        : node
    ));
  }, [draggedNode, dragOffset]);

  // Handle drag end
  const handleMouseUp = () => {
    if (draggedNode) {
      const currentNodes = nodes;
      setDraggedNode(null);
      // Call onPathsChange after drag ends
      setTimeout(() => onPathsChange?.(currentNodes), 0);
    }
  };

  // Delete selected node
  const deleteNode = (nodeId: string) => {
    setNodes(prev => {
      const newNodes = prev.filter(n => n.id !== nodeId);
      // Notify after deletion
      setTimeout(() => onPathsChange?.(newNodes), 0);
      return newNodes;
    });
    setConnections(prev => prev.filter(c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId));
    setSelectedNode(null);
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Visual Path Designer</span>
          <div className="flex items-center space-x-2">
            <Button 
              size="sm" 
              variant={isConnecting ? "default" : "outline"}
              onClick={() => {
                setIsConnecting(!isConnecting);
                setConnectionStart(null);
              }}
              className="h-7 text-xs"
            >
              <Move className="h-3 w-3 mr-1" />
              Connect
            </Button>
            
            <Button size="sm" variant="outline" onClick={() => {
              setNodes([]);
              setConnections([]);
              setSelectedNode(null);
            }} className="h-7 text-xs">
              Clear All
            </Button>
            
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <Save className="h-3 w-3 mr-1" />
              Save
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Dynamic Options Toolbar */}
        <div className="mb-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-xl border-2 border-dashed border-gray-300 shadow-inner">
          <div className="text-sm font-bold mb-3 text-gray-800 dark:text-gray-200 flex items-center space-x-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            <span>🎯 Sales Options - Drag to Build Your Path:</span>
            <Star className="w-4 h-4 text-yellow-500" />
          </div>
          <div className="flex flex-wrap gap-2">
            {availableOptions.map((option, index) => (
              <div
                key={`${option.type}-${option.value}-${index}`}
                draggable
                onDragStart={(e) => handleOptionDragStart(option, e)}
                className="cursor-move"
              >
                <Badge
                  variant="outline"
                  className={`
                    px-3 py-2 text-xs hover:bg-accent transition-all duration-200 border-2 border-dashed
                    hover:scale-105 hover:shadow-md cursor-move
                    ${option.type === 'category' ? 'border-blue-400 hover:border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200' :
                      option.type === 'brand' ? 'border-green-400 hover:border-green-500 bg-gradient-to-r from-green-50 to-green-100 hover:from-green-100 hover:to-green-200' :
                      option.type === 'style' ? 'border-purple-400 hover:border-purple-500 bg-gradient-to-r from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200' :
                      'border-pink-400 hover:border-pink-500 bg-gradient-to-r from-pink-50 to-pink-100 hover:from-pink-100 hover:to-pink-200'
                    }
                  `}
                >
                  <div className="flex items-center space-x-2">
                    {option.icon && (
                      <span className="text-current">{option.icon}</span>
                    )}
                    <span className="font-semibold">{option.label}</span>
                    {option.count && (
                      <span className="ml-1 text-xs bg-white/50 px-1 rounded-full font-bold text-gray-700">
                        {option.count}
                      </span>
                    )}
                    <Zap className="w-3 h-3 text-yellow-500 ml-1" />
                  </div>
                </Badge>
              </div>
            ))}
          </div>
          
          {availableOptions.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              Add products to see available options, or start with a category
            </div>
          )}
        </div>

        <div className="mb-4 text-sm text-gray-600">
          <div className="flex items-center space-x-4">
            <span>• **Drag with Icons**: Drag branded options to create sales paths</span>
            <span>• **Branch**: Drop on existing nodes to create branches</span>
            <span>• **Manual Connect**: Click Connect button then click two nodes</span>
            <span>• **Delete**: Select node and click × button</span>
          </div>
        </div>
        
        {/* Canvas Area */}
        <div 
          ref={canvasRef}
          className="relative bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 h-80 overflow-hidden"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDrop={handleCanvasDrop}
          onDragOver={handleCanvasDragOver}
        >
          {/* Grid Pattern */}
          <div className="absolute inset-0 opacity-20">
            <svg width="100%" height="100%">
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#cbd5e1" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>

          {/* Render Connections */}
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 1 }}
          >
            {connections.map(connection => {
              const fromNode = nodes.find(n => n.id === connection.fromNodeId);
              const toNode = nodes.find(n => n.id === connection.toNodeId);
              
              if (!fromNode || !toNode) return null;
              
              const fromX = fromNode.x + fromNode.width;
              const fromY = fromNode.y + fromNode.height / 2;
              const toX = toNode.x;
              const toY = toNode.y + toNode.height / 2;
              
              return (
                <g key={connection.id}>
                  <line
                    x1={fromX}
                    y1={fromY}
                    x2={toX}
                    y2={toY}
                    stroke="#6366f1"
                    strokeWidth="2"
                    markerEnd="url(#arrowhead)"
                  />
                </g>
              );
            })}
            
            {/* Arrow marker definition */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3.5, 0 7"
                  fill="#6366f1"
                />
              </marker>
            </defs>
          </svg>

          {/* Render Nodes */}
          {nodes.map(node => (
            <div
              key={node.id}
              onMouseDown={(e) => handleMouseDown(node.id, e)}
              onClick={() => setSelectedNode(node.id)}
              className={`
                absolute cursor-move select-none rounded-lg shadow-lg border-2 transition-all duration-200
                flex flex-col items-center justify-center text-white font-medium text-xs p-2
                ${selectedNode === node.id 
                  ? 'border-yellow-400 shadow-yellow-400/50 scale-105' 
                  : 'border-white/50 hover:scale-105'
                }
              `}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
                height: node.height,
                backgroundColor: node.color,
                zIndex: selectedNode === node.id ? 3 : 2
              }}
            >
              <div className="text-center">
                <div className="font-bold text-xs mb-1">{node.type.toUpperCase()}</div>
                <div className="font-medium text-xs leading-tight">{node.label}</div>
                {node.type === 'brand_selector' && (
                  <div className="text-xs text-white/80 mt-1">
                    {node.selectedOptions?.length || 0} selected
                  </div>
                )}
              </div>
              
              {/* Brand Selector Popup */}
              {selectedNode === node.id && node.type === 'brand_selector' && (() => {
                const categoryNode = nodes.find(n => n.id === node.parentId);
                const filteredBrands = node.availableOptions?.filter(brand => 
                  brand.toLowerCase().includes((node.filterQuery || '').toLowerCase())
                ) || [];
                
                return (
                  <div className="absolute left-full top-0 ml-2 bg-white border rounded-lg shadow-lg p-3 z-50 min-w-56">
                    <div className="text-sm font-semibold mb-2 text-gray-800">Select Brands:</div>
                    
                    {/* Filter Input */}
                    <input
                      type="text"
                      placeholder="Filter brands..."
                      value={node.filterQuery || ''}
                      onChange={(e) => handleFilterQueryChange(node.id, e.target.value)}
                      className="w-full px-2 py-1 text-xs border rounded mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                    
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {filteredBrands.map(brand => {
                        const brandCount = categoryNode 
                          ? allProducts.filter(p => p.category === categoryNode.value && p.brand === brand).length
                          : allProducts.filter(p => p.brand === brand).length;
                        
                        return (
                          <label key={brand} className="flex items-center space-x-3 text-sm text-gray-700 p-2 rounded hover:bg-gray-50 cursor-pointer transition-colors group">
                            <input
                              type="checkbox"
                              checked={node.selectedOptions?.includes(brand) || false}
                              onChange={(e) => handleBrandSelection(node.id, brand, e.target.checked)}
                              className="rounded border-2 w-4 h-4"
                            />
                            <div className="flex items-center space-x-2 flex-1">
                              <span className="text-lg group-hover:scale-110 transition-transform">
                                {getBrandIcon(brand)}
                              </span>
                              <span className="font-medium group-hover:text-green-600">{brand}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                                {brandCount}
                              </span>
                              <Star className="w-3 h-3 text-yellow-500" />
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    
                    {filteredBrands.length === 0 && (
                      <div className="text-xs text-gray-500 italic py-2">
                        No brands match filter
                      </div>
                    )}
                    
                    <button
                      onClick={() => createSelectedBrands(node)}
                      className="mt-4 w-full bg-gradient-to-r from-green-500 to-green-600 text-white text-sm py-2 px-4 rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 disabled:from-gray-300 disabled:to-gray-400 font-semibold shadow-md hover:shadow-lg transform hover:scale-105 flex items-center justify-center space-x-2"
                      disabled={!node.selectedOptions?.length}
                    >
                      <Star className="w-4 h-4" />
                      <span>🚀 Create Selected Brands ({node.selectedOptions?.length || 0})</span>
                      <Zap className="w-4 h-4" />
                    </button>
                  </div>
                );
              })()}
              
              {/* Delete button for selected node */}
              {selectedNode === node.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNode(node.id);
                  }}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                >
                  ×
                </button>
              )}
              
              {/* Connection points */}
              <div className="absolute -right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-white border-2 border-current rounded-full opacity-70 hover:opacity-100"></div>
            </div>
          ))}

          {/* Connection Mode Indicator */}
          {isConnecting && (
            <div className="absolute top-4 left-4 bg-blue-500 text-white px-3 py-1 rounded-lg text-xs font-medium">
              {connectionStart ? 'Click target node to connect' : 'Click first node to start connection'}
            </div>
          )}

          {/* Empty State */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <div className="mb-2 text-lg font-medium">Visual Path Designer</div>
                <div className="text-sm">Drag options from the toolbar above to start building your path</div>
                <div className="text-xs mt-1">Drop on existing nodes to create branches • Connect nodes with arrows</div>
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
          <div>
            Nodes: {nodes.length} • Connections: {connections.length}
            {selectedNode && ` • Selected: ${nodes.find(n => n.id === selectedNode)?.label}`}
          </div>
          <div className="flex items-center space-x-2">
            <span>Available Options: {availableOptions.length}</span>
            {isConnecting && <span className="text-blue-600 font-medium">Connection Mode Active</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}