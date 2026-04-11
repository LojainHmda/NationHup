import bcrypt from 'bcrypt';
import { storage } from './storage';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string | null;
    role: string;
    displayName?: string | null;
  };
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword);
}

export const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: 'Unauthorized' });
    }

    authReq.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const requireAdmin: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  
  await requireAuth(req, res, () => {
    if (authReq.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }
    next();
  });
};

export const requireCustomer: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  
  await requireAuth(req, res, () => {
    if (authReq.user?.role !== 'customer') {
      return res.status(403).json({ message: 'Forbidden: Customer access required' });
    }
    next();
  });
};

export const requireStaff: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const staffRoles = ['account_manager', 'sales', 'finance', 'admin'];
  
  await requireAuth(req, res, () => {
    if (!authReq.user?.role || !staffRoles.includes(authReq.user.role)) {
      return res.status(403).json({ message: 'Forbidden: Staff access required' });
    }
    next();
  });
};

export function requireRole(...allowedRoles: string[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    
    await requireAuth(req, res, () => {
      if (!authReq.user?.role || !allowedRoles.includes(authReq.user.role)) {
        return res.status(403).json({ message: `Forbidden: Requires ${allowedRoles.join(' or ')} role` });
      }
      next();
    });
  };
}

// Optional auth - populates user if logged in, but doesn't block access
export const optionalAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  
  if (!req.session || !req.session.userId) {
    return next();
  }

  try {
    const user = await storage.getUser(req.session.userId);
    if (user) {
      authReq.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      };
    }
    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next();
  }
};

export async function validateOrderApproval(orderId: string, userId: string): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  
  try {
    const order = await storage.getOrder(orderId);
    if (!order) {
      errors.push('Order not found');
      return { valid: false, errors };
    }

    const user = await storage.getUser(userId);
    if (!user) {
      errors.push('User not found');
      return { valid: false, errors };
    }

    const profile = await storage.getCustomerProfile(userId);
    if (!profile) {
      errors.push('Customer profile not found');
      return { valid: false, errors };
    }

    if (profile.isBlacklisted) {
      errors.push(`Customer is blacklisted: ${profile.blacklistReason || 'No reason provided'}`);
    }

    const orderTotal = parseFloat(order.total.toString());
    const creditLimit = parseFloat(profile.creditLimit?.toString() || '0');
    
    if (creditLimit > 0 && orderTotal > creditLimit) {
      errors.push(`Order total ($${orderTotal}) exceeds credit limit ($${creditLimit})`);
    }

    const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const MAX_QUANTITY_PER_ORDER = 10000;
    
    if (totalQuantity > MAX_QUANTITY_PER_ORDER) {
      errors.push(`Total quantity (${totalQuantity}) exceeds maximum allowed (${MAX_QUANTITY_PER_ORDER})`);
    }

    const MIN_ORDER_VALUE = 100;
    if (orderTotal < MIN_ORDER_VALUE) {
      errors.push(`Order total ($${orderTotal}) is below minimum order value ($${MIN_ORDER_VALUE})`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  } catch (error) {
    console.error('Order validation error:', error);
    errors.push('Validation error occurred');
    return { valid: false, errors };
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    oauth2State?: string;
    returnTo?: string;
  }
}
