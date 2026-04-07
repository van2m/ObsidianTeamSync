// CodeMirror 6 collaborative editing extension factory / CM6 协同编辑扩展工厂
// Creates CM6 extensions for real-time collaborative editing with Yjs

import type { Extension } from '@codemirror/state';
import { yCollab } from 'y-codemirror.next';
import { UndoManager } from 'yjs';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

// Color palette for remote cursors / 远程光标颜色调色板
const CURSOR_COLORS = [
  '#30bced', '#6eeb83', '#ffbc42', '#e84855',
  '#8f3985', '#17bebb', '#ee6352', '#59c3c3',
];

/** Create CM6 collaborative editing extension */
export function createCollabExtension(
  ytext: Y.Text,
  awareness: Awareness,
  userInfo: { name: string; color?: string },
): Extension {
  // Assign a color based on awareness clientID
  const colorIndex = awareness.clientID % CURSOR_COLORS.length;
  const color = userInfo.color || CURSOR_COLORS[colorIndex];

  // Set local awareness user state
  awareness.setLocalStateField('user', {
    name: userInfo.name,
    color,
    colorLight: color + '40', // 25% opacity for selection highlight
  });

  // Create collaborative UndoManager (only tracks own changes)
  const undoManager = new UndoManager(ytext);

  return yCollab(ytext, awareness, { undoManager });
}
