import { z } from 'zod';

export const emailSchema = z.string().email('Please enter a valid email');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/\d/, 'Password must contain a number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain a special character');
