-- Create storage bucket for permit attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('permit-attachments', 'permit-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for permit attachments
CREATE POLICY "Anyone can view permit attachments" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'permit-attachments');

CREATE POLICY "Authenticated users can upload permit attachments" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'permit-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their own permit attachments" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'permit-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);