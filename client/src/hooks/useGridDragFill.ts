import { useState, useCallback, useRef, useEffect } from 'react';

export interface GridCell {
  row: number;
  col: number;
}

export interface GridRegion {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

export interface UseGridDragFillOptions {
  onFillStart?: (cell: GridCell) => void;
  onFillUpdate?: (region: GridRegion) => void;
  onFillEnd?: (region: GridRegion) => void;
  onSelectionChange?: (cells: Set<string>) => void;
  cellValidator?: (row: number, col: number) => boolean;
  sameRowOnly?: boolean;
  continuousFill?: boolean;
  getCellKey?: (row: number, col: number) => string;
}

export interface GridDragFillState {
  isDragging: boolean;
  dragStart: GridCell | null;
  dragEnd: GridCell | null;
  selectedCells: Set<string>;
  activeRegion: GridRegion | null;
}

export function useGridDragFill(options: UseGridDragFillOptions = {}) {
  const {
    onFillStart,
    onFillUpdate,
    onFillEnd,
    onSelectionChange,
    cellValidator = () => true,
    sameRowOnly = false,
    continuousFill = false,
    getCellKey = (row, col) => `${row}-${col}`,
  } = options;

  const [state, setState] = useState<GridDragFillState>({
    isDragging: false,
    dragStart: null,
    dragEnd: null,
    selectedCells: new Set(),
    activeRegion: null,
  });

  const dragStartRef = useRef<GridCell | null>(null);

  const computeRegion = useCallback((start: GridCell, end: GridCell): GridRegion => {
    const minRow = sameRowOnly ? start.row : Math.min(start.row, end.row);
    const maxRow = sameRowOnly ? start.row : Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    
    return { minRow, maxRow, minCol, maxCol };
  }, [sameRowOnly]);

  const getCellsInRegion = useCallback((region: GridRegion): Set<string> => {
    const cells = new Set<string>();
    for (let row = region.minRow; row <= region.maxRow; row++) {
      for (let col = region.minCol; col <= region.maxCol; col++) {
        if (cellValidator(row, col)) {
          cells.add(getCellKey(row, col));
        }
      }
    }
    return cells;
  }, [cellValidator, getCellKey]);

  const handleMouseDown = useCallback((row: number, col: number, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
    }
    
    if (!cellValidator(row, col)) return;

    const cell = { row, col };
    dragStartRef.current = cell;
    
    const region = computeRegion(cell, cell);
    const selectedCells = getCellsInRegion(region);

    setState({
      isDragging: true,
      dragStart: cell,
      dragEnd: cell,
      selectedCells,
      activeRegion: region,
    });

    onFillStart?.(cell);
    onSelectionChange?.(selectedCells);
  }, [cellValidator, computeRegion, getCellsInRegion, onFillStart, onSelectionChange]);

  const handleMouseEnter = useCallback((row: number, col: number) => {
    if (!state.isDragging || !dragStartRef.current) return;
    if (!cellValidator(row, col)) return;

    const cell = { row, col };
    const region = computeRegion(dragStartRef.current, cell);
    const selectedCells = getCellsInRegion(region);

    setState(prev => ({
      ...prev,
      dragEnd: cell,
      selectedCells,
      activeRegion: region,
    }));

    onFillUpdate?.(region);
    onSelectionChange?.(selectedCells);
  }, [state.isDragging, cellValidator, computeRegion, getCellsInRegion, onFillUpdate, onSelectionChange]);

  const handleMouseUp = useCallback(() => {
    if (!state.isDragging || !state.activeRegion) return;

    onFillEnd?.(state.activeRegion);

    if (!continuousFill) {
      setState(prev => ({
        ...prev,
        isDragging: false,
      }));
    } else {
      setState(prev => ({
        ...prev,
        isDragging: false,
        dragStart: null,
        dragEnd: null,
        selectedCells: new Set(),
        activeRegion: null,
      }));
    }

    dragStartRef.current = null;
  }, [state.isDragging, state.activeRegion, continuousFill, onFillEnd]);

  const clearSelection = useCallback(() => {
    setState({
      isDragging: false,
      dragStart: null,
      dragEnd: null,
      selectedCells: new Set(),
      activeRegion: null,
    });
    dragStartRef.current = null;
  }, []);

  const isInSelection = useCallback((row: number, col: number): boolean => {
    return state.selectedCells.has(getCellKey(row, col));
  }, [state.selectedCells, getCellKey]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (state.isDragging) {
        handleMouseUp();
      }
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [state.isDragging, handleMouseUp]);

  return {
    ...state,
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
    clearSelection,
    isInSelection,
    computeRegion,
    getCellsInRegion,
  };
}
