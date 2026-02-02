-- Insert new permission for workflow modification
INSERT INTO public.permissions (name, label, description, category)
VALUES (
  'modify_workflow',
  'Modify Workflow',
  'Allows modifying permit workflow during approval (change work type or create custom flow)',
  'Permits'
)
ON CONFLICT (name) DO NOTHING;