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
      users: {
        Row: {
          username: string;
          data: Json | null;
          age_range: unknown | null;
          catchphrase: unknown | null;
          status: Database['public']['Enums']['user_status'] | null;
        };
        Insert: {
          username: string;
          data?: Json | null;
          age_range?: unknown | null;
          catchphrase?: unknown | null;
          status?: Database['public']['Enums']['user_status'] | null;
        };
        Update: {
          username?: string;
          data?: Json | null;
          age_range?: unknown | null;
          catchphrase?: unknown | null;
          status?: Database['public']['Enums']['user_status'] | null;
        };
      };
    };
    Views: {
      non_updatable_view: {
        Row: {
          username: string | null;
        };
      };
    };
    Functions: {
      get_status: {
        Args: { name_param: string };
        Returns: Database['public']['Enums']['user_status'];
      };
    };
    Enums: {
      user_status: 'ONLINE' | 'OFFLINE';
    };
  };
  schema_b: {
    Tables: {
      users: {
        Row: {
          username: string;
          data: Json | null;
          status: Database['public']['Enums']['user_status'] | null;
        };
        Insert: {
          username: string;
          age_range?: unknown | null;
          catchphrase?: unknown | null;
          status?: Database['schema_b']['Enums']['user_status'] | null;
        };
        Update: {
          data?: Json | null;
          age_range?: unknown | null;
          catchphrase?: unknown | null;
          status?: Database['schema_b']['Enums']['user_status'] | null;
        };
      };
    };
    Views: {
      non_updatable_view: {
        Row: {
          username: string | null;
        };
      };
    };
    Functions: {
      get_deployment_config_schema: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_status: {
        Args: { name_param: string };
        Returns: Database['schema_b']['Enums']['user_status'];
      };
    };
    Enums: {
      user_status: 'ONLINE' | 'OFFLINE';
    };
  };
}
