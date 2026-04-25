export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      entries: {
        Row: {
          content: Json
          created_at: string
          deleted_at: string | null
          entry_date: string
          entry_id: string
          is_hidden: boolean
          is_pinned: boolean
          journal_id: string
          lock_hash: string | null
          lock_type: string
          title: string | null
          updated_at: string
          word_count: number
        }
        Insert: {
          content?: Json
          created_at?: string
          deleted_at?: string | null
          entry_date?: string
          entry_id?: string
          is_hidden?: boolean
          is_pinned?: boolean
          journal_id: string
          lock_hash?: string | null
          lock_type?: string
          title?: string | null
          updated_at?: string
          word_count?: number
        }
        Update: {
          content?: Json
          created_at?: string
          deleted_at?: string | null
          entry_date?: string
          entry_id?: string
          is_hidden?: boolean
          is_pinned?: boolean
          journal_id?: string
          lock_hash?: string | null
          lock_type?: string
          title?: string | null
          updated_at?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "entries_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["journal_id"]
          },
        ]
      }
      entry_tags: {
        Row: {
          entry_id: string
          tag_id: string
          tagged_at: string
        }
        Insert: {
          entry_id: string
          tag_id: string
          tagged_at?: string
        }
        Update: {
          entry_id?: string
          tag_id?: string
          tagged_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_tags_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "entry_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["tag_id"]
          },
        ]
      }
      journals: {
        Row: {
          color: string
          created_at: string
          deleted_at: string | null
          description: string | null
          entry_count: number
          entry_lock_hash: string | null
          entry_lock_type: string
          icon: string
          is_favorite: boolean
          is_hidden: boolean
          journal_id: string
          lock_hash: string | null
          lock_type: string
          title: string
          total_word_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          entry_count?: number
          entry_lock_hash?: string | null
          entry_lock_type?: string
          icon?: string
          is_favorite?: boolean
          is_hidden?: boolean
          journal_id?: string
          lock_hash?: string | null
          lock_type?: string
          title: string
          total_word_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          entry_count?: number
          entry_lock_hash?: string | null
          entry_lock_type?: string
          icon?: string
          is_favorite?: boolean
          is_hidden?: boolean
          journal_id?: string
          lock_hash?: string | null
          lock_type?: string
          title?: string
          total_word_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      media: {
        Row: {
          alt_text: string | null
          duration: number | null
          entry_id: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          height: number | null
          media_id: string
          mime_type: string
          thumbnail_url: string | null
          uploaded_at: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          duration?: number | null
          entry_id: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          height?: number | null
          media_id?: string
          mime_type: string
          thumbnail_url?: string | null
          uploaded_at?: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          duration?: number | null
          entry_id?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          height?: number | null
          media_id?: string
          mime_type?: string
          thumbnail_url?: string | null
          uploaded_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["entry_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          preferences: Json
          privacy_pin_hash: string | null
          privacy_pin_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          preferences?: Json
          privacy_pin_hash?: string | null
          privacy_pin_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          preferences?: Json
          privacy_pin_hash?: string | null
          privacy_pin_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          tag_id: string
          tag_name: string
          usage_count: number
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          tag_id?: string
          tag_name: string
          usage_count?: number
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          tag_id?: string
          tag_name?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      extract_tiptap_text: { Args: { doc: Json }; Returns: string }
      fn_compute_word_count: { Args: { content: Json }; Returns: number }
      search_entries: {
        Args: {
          p_from?: string
          p_journal_id?: string
          p_pinned?: boolean
          p_query: string
          p_tag_ids?: string[]
          p_to?: string
        }
        Returns: {
          content: Json
          entry_date: string
          entry_id: string
          is_pinned: boolean
          journal_color: string
          journal_id: string
          journal_title: string
          title: string
          word_count: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
