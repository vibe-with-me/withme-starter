export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reveals_card: boolean
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reveals_card?: boolean
          tenant_id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reveals_card?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connect_requests: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          recipient_id: string
          requester_id: string
          status: Database["public"]["Enums"]["connect_request_status"]
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          recipient_id: string
          requester_id: string
          status?: Database["public"]["Enums"]["connect_request_status"]
          tenant_id?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          recipient_id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["connect_request_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_requests_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connect_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          created_at: string
          id: string
          tenant_id: string
          user_a: string
          user_b: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          tenant_id?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gathering_members: {
        Row: {
          gathering_id: string
          joined_at: string
          profile_id: string
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          gathering_id: string
          joined_at?: string
          profile_id: string
          tenant_id?: string
        }
        Update: {
          gathering_id?: string
          joined_at?: string
          profile_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gathering_members_gathering_id_fkey"
            columns: ["gathering_id"]
            isOneToOne: false
            referencedRelation: "gatherings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gathering_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gatherings: {
        Row: {
          created_at: string
          host_id: string
          id: string
          location: string | null
          starts_at: string
          tenant_id: string
          title: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          host_id: string
          id?: string
          location?: string | null
          starts_at: string
          tenant_id?: string
          title: string
        }
        Update: {
          created_at?: string
          host_id?: string
          id?: string
          location?: string | null
          starts_at?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "gatherings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_links: {
        Row: {
          created_at: string
          platform: string
          profile_id: string
          sort_order: number
          tenant_id: string
          updated_at: string
          value: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          platform: string
          profile_id: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          platform?: string
          profile_id?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_links_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          tenant_id: string
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          id: string
          tenant_id?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          tenant_id?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_id: string
          reporter_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          snapshot: NonNullable<Json>
          status: string
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_id: string
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          snapshot: NonNullable<Json>
          status?: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_id?: string
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          snapshot?: NonNullable<Json>
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_scans: {
        Row: {
          id: string
          scanned_at: string
          tag_uid: string
          tenant_id: string
          user_agent: string | null
        }
        ComputedFields: never
        Insert: {
          id?: string
          scanned_at?: string
          tag_uid: string
          tenant_id?: string
          user_agent?: string | null
        }
        Update: {
          id?: string
          scanned_at?: string
          tag_uid?: string
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_scans_tag_uid_fkey"
            columns: ["tag_uid"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["uid"]
          },
        ]
      }
      tags: {
        Row: {
          claimed_by: string | null
          created_at: string
          destination: Json | null
          status: Database["public"]["Enums"]["tag_status"]
          tenant_id: string
          uid: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          claimed_by?: string | null
          created_at?: string
          destination?: Json | null
          status?: Database["public"]["Enums"]["tag_status"]
          tenant_id?: string
          uid: string
          updated_at?: string
        }
        Update: {
          claimed_by?: string | null
          created_at?: string
          destination?: Json | null
          status?: Database["public"]["Enums"]["tag_status"]
          tenant_id?: string
          uid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_connect_request: { Args: { p_request_id: string }; Returns: Json }
      claim_tag: {
        Args: { p_destination?: Json; p_uid: string }
        Returns: Json
      }
      create_gathering: {
        Args: { p_location?: string; p_starts_at: string; p_title: string }
        Returns: Json
      }
      decline_connect_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      delete_my_account: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      gathering_member_counts: {
        Args: { p_ids: string[] }
        Returns: {
          gathering_id: string
          member_count: number
        }[]
      }
      join_gathering: { Args: { p_gathering_id: string }; Returns: undefined }
      log_scan: {
        Args: { p_uid: string; p_user_agent?: string }
        Returns: undefined
      }
      report_user: {
        Args: {
          p_block?: boolean
          p_details?: string
          p_reason: string
          p_reported: string
        }
        Returns: undefined
      }
      resolve_tag: { Args: { p_uid: string }; Returns: Json }
      send_connect_request: {
        Args: { p_recipient: string }
        Returns: undefined
      }
      set_my_links: {
        Args: { p_links: Json }
        Returns: {
          created_at: string
          platform: string
          profile_id: string
          sort_order: number
          tenant_id: string
          updated_at: string
          value: string
        }[]
        SetofOptions: {
          from: "*"
          to: "profile_links"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      connect_request_status: "pending" | "accepted" | "declined" | "expired"
      tag_status: "unclaimed" | "claimed" | "disabled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      connect_request_status: ["pending", "accepted", "declined", "expired"],
      tag_status: ["unclaimed", "claimed", "disabled"],
    },
  },
} as const
