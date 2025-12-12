export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type Database = {
  public: {
    Tables: {
      posts: {
        Row: {
          id: number;
          title: string;
          content: string | null;
          author_id: string;
          status: Database['public']['Enums']['post_status'];
          created_at: string;
        };
        Insert: {
          id?: number;
          title: string;
          content?: string | null;
          author_id: string;
          status?: Database['public']['Enums']['post_status'];
          created_at?: string;
        };
        Update: {
          id?: number;
          title?: string;
          content?: string | null;
          author_id?: string;
          status?: Database['public']['Enums']['post_status'];
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {
      post_status: 'draft' | 'published' | 'archived';
    };
    CompositeTypes: {};
  };
};
