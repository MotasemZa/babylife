export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_user_state: {
        Row: {
          blocked_at: string | null
          blocked_reason: string | null
          deleted_at: string | null
          deleted_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked_at?: string | null
          blocked_reason?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked_at?: string | null
          blocked_reason?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bulk_import_items: {
        Row: {
          ai_group_key: string | null
          created_at: string
          description: string | null
          family_key: string | null
          group_key: string | null
          id: string
          image_search_note: string | null
          image_urls: Json | null
          is_parent: boolean | null
          job_id: string
          price: string | null
          product_type: string | null
          published_stores: Json | null
          raw_data: Json | null
          skip_reason: string | null
          status: string
          tags: string | null
          title: string | null
          updated_at: string
          user_id: string
          variant_label: string | null
        }
        Insert: {
          ai_group_key?: string | null
          created_at?: string
          description?: string | null
          family_key?: string | null
          group_key?: string | null
          id?: string
          image_search_note?: string | null
          image_urls?: Json | null
          is_parent?: boolean | null
          job_id: string
          price?: string | null
          product_type?: string | null
          published_stores?: Json | null
          raw_data?: Json | null
          skip_reason?: string | null
          status?: string
          tags?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          variant_label?: string | null
        }
        Update: {
          ai_group_key?: string | null
          created_at?: string
          description?: string | null
          family_key?: string | null
          group_key?: string | null
          id?: string
          image_search_note?: string | null
          image_urls?: Json | null
          is_parent?: boolean | null
          job_id?: string
          price?: string | null
          product_type?: string | null
          published_stores?: Json | null
          raw_data?: Json | null
          skip_reason?: string | null
          status?: string
          tags?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulk_import_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "bulk_import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_import_jobs: {
        Row: {
          context: string | null
          created_at: string
          file_name: string | null
          id: string
          processed_rows: number
          search_images: boolean
          status: string
          total_rows: number
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          processed_rows?: number
          search_images?: boolean
          status?: string
          total_rows?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          processed_rows?: number
          search_images?: boolean
          status?: string
          total_rows?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      buyer_addresses: {
        Row: {
          buyer_email: string | null
          buyer_username: string | null
          city: string | null
          country_code: string | null
          country_name: string | null
          created_at: string
          full_name: string | null
          id: string
          order_id: string
          phone: string | null
          postal_code: string | null
          raw_data: Json | null
          state_province: string | null
          street_address: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          buyer_email?: string | null
          buyer_username?: string | null
          city?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          order_id: string
          phone?: string | null
          postal_code?: string | null
          raw_data?: Json | null
          state_province?: string | null
          street_address?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          buyer_email?: string | null
          buyer_username?: string | null
          city?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          order_id?: string
          phone?: string | null
          postal_code?: string | null
          raw_data?: Json | null
          state_province?: string | null
          street_address?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      digital_keys: {
        Row: {
          created_at: string
          digital_key: string
          download_url: string | null
          id: string
          inventory_item_id: string | null
          item_title: string | null
          listing_id: string
          order_id: string | null
          platform: string | null
          status: string
          updated_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          digital_key: string
          download_url?: string | null
          id?: string
          inventory_item_id?: string | null
          item_title?: string | null
          listing_id: string
          order_id?: string | null
          platform?: string | null
          status?: string
          updated_at?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          digital_key?: string
          download_url?: string | null
          id?: string
          inventory_item_id?: string | null
          item_title?: string | null
          listing_id?: string
          order_id?: string | null
          platform?: string | null
          status?: string
          updated_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_keys_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_ad_accounts: {
        Row: {
          access_token: string
          account_name: string | null
          ad_account_id: string
          created_at: string | null
          id: string
          page_id: string | null
          page_name: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          account_name?: string | null
          ad_account_id: string
          created_at?: string | null
          id?: string
          page_id?: string | null
          page_name?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          account_name?: string | null
          ad_account_id?: string
          created_at?: string | null
          id?: string
          page_id?: string | null
          page_name?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fulfillment_log: {
        Row: {
          buyer_email: string | null
          buyer_username: string | null
          created_at: string
          digital_key_id: string | null
          error_message: string | null
          id: string
          inventory_item_id: string | null
          invoice_error: string | null
          invoice_sent: boolean | null
          item_title: string | null
          listing_id: string | null
          marked_fulfilled: boolean | null
          message_body: string | null
          message_error: string | null
          message_sent: boolean | null
          order_id: string
          platform: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          buyer_email?: string | null
          buyer_username?: string | null
          created_at?: string
          digital_key_id?: string | null
          error_message?: string | null
          id?: string
          inventory_item_id?: string | null
          invoice_error?: string | null
          invoice_sent?: boolean | null
          item_title?: string | null
          listing_id?: string | null
          marked_fulfilled?: boolean | null
          message_body?: string | null
          message_error?: string | null
          message_sent?: boolean | null
          order_id: string
          platform?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          buyer_email?: string | null
          buyer_username?: string | null
          created_at?: string
          digital_key_id?: string | null
          error_message?: string | null
          id?: string
          inventory_item_id?: string | null
          invoice_error?: string | null
          invoice_sent?: boolean | null
          item_title?: string | null
          listing_id?: string | null
          marked_fulfilled?: boolean | null
          message_body?: string | null
          message_error?: string | null
          message_sent?: boolean | null
          order_id?: string
          platform?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_log_digital_key_id_fkey"
            columns: ["digital_key_id"]
            isOneToOne: false
            referencedRelation: "digital_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_log_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      import_history: {
        Row: {
          completed_at: string | null
          created_at: string
          error_count: number | null
          errors: Json | null
          file_name: string | null
          id: string
          row_count: number | null
          started_at: string
          status: string | null
          type: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_count?: number | null
          errors?: Json | null
          file_name?: string | null
          id?: string
          row_count?: number | null
          started_at?: string
          status?: string | null
          type: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_count?: number | null
          errors?: Json | null
          file_name?: string | null
          id?: string
          row_count?: number | null
          started_at?: string
          status?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          auto_delivery_enabled: boolean | null
          created_at: string | null
          delivery_message: string | null
          description: string | null
          download_url: string | null
          id: string
          name: string
          sku: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_delivery_enabled?: boolean | null
          created_at?: string | null
          delivery_message?: string | null
          description?: string | null
          download_url?: string | null
          id?: string
          name: string
          sku?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_delivery_enabled?: boolean | null
          created_at?: string | null
          delivery_message?: string | null
          description?: string | null
          download_url?: string | null
          id?: string
          name?: string
          sku?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          buyer_address: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_vat_number: string | null
          created_at: string
          currency: string | null
          id: string
          invoice_date: string
          invoice_number: string
          line_items: Json
          order_id: string
          pdf_url: string | null
          seller_address: string | null
          seller_email: string | null
          seller_name: string | null
          seller_vat_number: string | null
          sent_at: string | null
          sent_to_email: string | null
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          tax_rate: number | null
          total: number | null
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          buyer_address?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_vat_number?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          line_items?: Json
          order_id: string
          pdf_url?: string | null
          seller_address?: string | null
          seller_email?: string | null
          seller_name?: string | null
          seller_vat_number?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total?: number | null
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          buyer_address?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_vat_number?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          line_items?: Json
          order_id?: string
          pdf_url?: string | null
          seller_address?: string | null
          seller_email?: string | null
          seller_name?: string | null
          seller_vat_number?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total?: number | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          created_at: string
          currency: string | null
          description: string | null
          ebay_item_id: string
          id: string
          image_url: string | null
          listing_url: string | null
          price: number | null
          quantity: number | null
          raw_data: Json | null
          sku: string | null
          start_time: string | null
          status: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          description?: string | null
          ebay_item_id: string
          id?: string
          image_url?: string | null
          listing_url?: string | null
          price?: number | null
          quantity?: number | null
          raw_data?: Json | null
          sku?: string | null
          start_time?: string | null
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          description?: string | null
          ebay_item_id?: string
          id?: string
          image_url?: string | null
          listing_url?: string | null
          price?: number | null
          quantity?: number | null
          raw_data?: Json | null
          sku?: string | null
          start_time?: string | null
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          ad_copy: Json | null
          budget: number | null
          clicks: number | null
          conversions: number | null
          created_at: string
          daily_budget: number | null
          end_date: string | null
          fb_ad_id: string | null
          fb_adset_id: string | null
          fb_campaign_id: string | null
          fb_status: string | null
          id: string
          name: string
          platform: string
          spent: number | null
          start_date: string | null
          status: string
          targeting: Json | null
          updated_at: string
          user_id: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          ad_copy?: Json | null
          budget?: number | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          daily_budget?: number | null
          end_date?: string | null
          fb_ad_id?: string | null
          fb_adset_id?: string | null
          fb_campaign_id?: string | null
          fb_status?: string | null
          id?: string
          name: string
          platform?: string
          spent?: number | null
          start_date?: string | null
          status?: string
          targeting?: Json | null
          updated_at?: string
          user_id: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          ad_copy?: Json | null
          budget?: number | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          daily_budget?: number | null
          end_date?: string | null
          fb_ad_id?: string | null
          fb_adset_id?: string | null
          fb_campaign_id?: string | null
          fb_status?: string | null
          id?: string
          name?: string
          platform?: string
          spent?: number | null
          start_date?: string | null
          status?: string
          targeting?: Json | null
          updated_at?: string
          user_id?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      marketing_videos: {
        Row: {
          content_type: string
          created_at: string
          duration_seconds: number | null
          id: string
          image_url: string | null
          product_ids: string[] | null
          script: Json | null
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          content_type?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          image_url?: string | null
          product_ids?: string[] | null
          script?: Json | null
          status?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          content_type?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          image_url?: string | null
          product_ids?: string[] | null
          script?: Json | null
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          created_at: string
          id: string
          notify_daily_summary: boolean
          notify_fulfillment_failed: boolean
          notify_fulfillment_success: boolean
          notify_invoice_failed: boolean
          notify_out_of_stock: boolean
          telegram_chat_id: string | null
          telegram_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notify_daily_summary?: boolean
          notify_fulfillment_failed?: boolean
          notify_fulfillment_success?: boolean
          notify_invoice_failed?: boolean
          notify_out_of_stock?: boolean
          telegram_chat_id?: string | null
          telegram_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notify_daily_summary?: boolean
          notify_fulfillment_failed?: boolean
          notify_fulfillment_success?: boolean
          notify_invoice_failed?: boolean
          notify_out_of_stock?: boolean
          telegram_chat_id?: string | null
          telegram_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          adjustments: number | null
          created_at: string
          external_id: string | null
          fees: number | null
          gross: number | null
          id: string
          net: number | null
          payout_date: string
          payout_id: string | null
          raw_data: Json | null
          status: string | null
          transaction_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          adjustments?: number | null
          created_at?: string
          external_id?: string | null
          fees?: number | null
          gross?: number | null
          id?: string
          net?: number | null
          payout_date: string
          payout_id?: string | null
          raw_data?: Json | null
          status?: string | null
          transaction_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          adjustments?: number | null
          created_at?: string
          external_id?: string | null
          fees?: number | null
          gross?: number | null
          id?: string
          net?: number | null
          payout_date?: string
          payout_id?: string | null
          raw_data?: Json | null
          status?: string | null
          transaction_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_listings: {
        Row: {
          created_at: string | null
          currency: string | null
          id: string
          image_url: string | null
          inventory_item_id: string | null
          platform: string
          platform_listing_id: string
          price: number | null
          raw_data: Json | null
          status: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          id?: string
          image_url?: string | null
          inventory_item_id?: string | null
          platform: string
          platform_listing_id: string
          price?: number | null
          raw_data?: Json | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          id?: string
          image_url?: string | null
          inventory_item_id?: string | null
          platform?: string
          platform_listing_id?: string
          price?: number | null
          raw_data?: Json | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_listings_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      smtp_settings: {
        Row: {
          bcc_email: string | null
          created_at: string
          email_footer_html: string | null
          enabled: boolean
          from_email: string | null
          from_name: string | null
          host: string | null
          id: string
          last_error: string | null
          password_encrypted: string | null
          port: number | null
          reply_to: string | null
          secure: boolean
          updated_at: string
          user_id: string
          username: string | null
          verified_at: string | null
        }
        Insert: {
          bcc_email?: string | null
          created_at?: string
          email_footer_html?: string | null
          enabled?: boolean
          from_email?: string | null
          from_name?: string | null
          host?: string | null
          id?: string
          last_error?: string | null
          password_encrypted?: string | null
          port?: number | null
          reply_to?: string | null
          secure?: boolean
          updated_at?: string
          user_id: string
          username?: string | null
          verified_at?: string | null
        }
        Update: {
          bcc_email?: string | null
          created_at?: string
          email_footer_html?: string | null
          enabled?: boolean
          from_email?: string | null
          from_name?: string | null
          host?: string | null
          id?: string
          last_error?: string | null
          password_encrypted?: string | null
          port?: number | null
          reply_to?: string | null
          secure?: boolean
          updated_at?: string
          user_id?: string
          username?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string
          trial_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string
          trial_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string
          trial_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          buyer_country: string | null
          category: string | null
          created_at: string
          currency: string | null
          date: string
          external_id: string | null
          fees: number | null
          gross: number | null
          id: string
          item_title: string | null
          net: number | null
          notes: string | null
          order_id: string | null
          quantity: number | null
          raw_data: Json | null
          refunds: number | null
          shipping_charged: number | null
          shipping_cost: number | null
          sku: string | null
          status: string | null
          tax_collected: number | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          buyer_country?: string | null
          category?: string | null
          created_at?: string
          currency?: string | null
          date: string
          external_id?: string | null
          fees?: number | null
          gross?: number | null
          id?: string
          item_title?: string | null
          net?: number | null
          notes?: string | null
          order_id?: string | null
          quantity?: number | null
          raw_data?: Json | null
          refunds?: number | null
          shipping_charged?: number | null
          shipping_cost?: number | null
          sku?: string | null
          status?: string | null
          tax_collected?: number | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          buyer_country?: string | null
          category?: string | null
          created_at?: string
          currency?: string | null
          date?: string
          external_id?: string | null
          fees?: number | null
          gross?: number | null
          id?: string
          item_title?: string | null
          net?: number | null
          notes?: string | null
          order_id?: string | null
          quantity?: number | null
          raw_data?: Json | null
          refunds?: number | null
          shipping_charged?: number | null
          shipping_cost?: number | null
          sku?: string | null
          status?: string | null
          tax_collected?: number | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_ebay_credentials: {
        Row: {
          created_at: string
          ebay_access_token: string | null
          ebay_refresh_token: string | null
          ebay_signing_key_created_at: string | null
          ebay_signing_key_id: string | null
          ebay_signing_key_jwe: string | null
          ebay_signing_private_key: string | null
          ebay_token_expires_at: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ebay_access_token?: string | null
          ebay_refresh_token?: string | null
          ebay_signing_key_created_at?: string | null
          ebay_signing_key_id?: string | null
          ebay_signing_key_jwe?: string | null
          ebay_signing_private_key?: string | null
          ebay_token_expires_at?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ebay_access_token?: string | null
          ebay_refresh_token?: string | null
          ebay_signing_key_created_at?: string | null
          ebay_signing_key_id?: string | null
          ebay_signing_key_jwe?: string | null
          ebay_signing_private_key?: string | null
          ebay_token_expires_at?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          ai_credits: number
          ai_model: string
          auto_delivery_enabled: boolean
          auto_send_invoice: boolean
          bcc_email: string | null
          country: string | null
          created_at: string
          currency: string | null
          ebay_access_token: string | null
          ebay_refresh_token: string | null
          ebay_signing_key_created_at: string | null
          ebay_signing_key_id: string | null
          ebay_signing_key_jwe: string | null
          ebay_signing_private_key: string | null
          ebay_token_expires_at: string | null
          id: string
          invoice_email_body_html: string | null
          invoice_email_subject: string | null
          invoice_layout: Json
          invoice_logo_url: string | null
          invoice_motto: string | null
          invoice_prefix: string | null
          invoice_template: string | null
          next_invoice_number: number | null
          seller_address: string | null
          seller_business_name: string | null
          seller_city: string | null
          seller_contact_department: string | null
          seller_contact_email: string | null
          seller_contact_name: string | null
          seller_contact_phone: string | null
          seller_country: string | null
          seller_email: string | null
          seller_postal_code: string | null
          seller_street: string | null
          seller_vat_number: string | null
          tax_year_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_credits?: number
          ai_model?: string
          auto_delivery_enabled?: boolean
          auto_send_invoice?: boolean
          bcc_email?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          ebay_access_token?: string | null
          ebay_refresh_token?: string | null
          ebay_signing_key_created_at?: string | null
          ebay_signing_key_id?: string | null
          ebay_signing_key_jwe?: string | null
          ebay_signing_private_key?: string | null
          ebay_token_expires_at?: string | null
          id?: string
          invoice_email_body_html?: string | null
          invoice_email_subject?: string | null
          invoice_layout?: Json
          invoice_logo_url?: string | null
          invoice_motto?: string | null
          invoice_prefix?: string | null
          invoice_template?: string | null
          next_invoice_number?: number | null
          seller_address?: string | null
          seller_business_name?: string | null
          seller_city?: string | null
          seller_contact_department?: string | null
          seller_contact_email?: string | null
          seller_contact_name?: string | null
          seller_contact_phone?: string | null
          seller_country?: string | null
          seller_email?: string | null
          seller_postal_code?: string | null
          seller_street?: string | null
          seller_vat_number?: string | null
          tax_year_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_credits?: number
          ai_model?: string
          auto_delivery_enabled?: boolean
          auto_send_invoice?: boolean
          bcc_email?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          ebay_access_token?: string | null
          ebay_refresh_token?: string | null
          ebay_signing_key_created_at?: string | null
          ebay_signing_key_id?: string | null
          ebay_signing_key_jwe?: string | null
          ebay_signing_private_key?: string | null
          ebay_token_expires_at?: string | null
          id?: string
          invoice_email_body_html?: string | null
          invoice_email_subject?: string | null
          invoice_layout?: Json
          invoice_logo_url?: string | null
          invoice_motto?: string | null
          invoice_prefix?: string | null
          invoice_template?: string | null
          next_invoice_number?: number | null
          seller_address?: string | null
          seller_business_name?: string | null
          seller_city?: string | null
          seller_contact_department?: string | null
          seller_contact_email?: string | null
          seller_contact_name?: string | null
          seller_contact_phone?: string | null
          seller_country?: string | null
          seller_email?: string | null
          seller_postal_code?: string | null
          seller_street?: string | null
          seller_vat_number?: string | null
          tax_year_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_shopify_credentials: {
        Row: {
          access_token: string | null
          created_at: string
          id: string
          label: string | null
          scope: string | null
          shop_domain: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          id?: string
          label?: string | null
          scope?: string | null
          shop_domain: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          id?: string
          label?: string | null
          scope?: string | null
          shop_domain?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      user_settings_safe: {
        Row: {
          ai_credits: number | null
          ai_model: string | null
          auto_delivery_enabled: boolean | null
          country: string | null
          created_at: string | null
          currency: string | null
          ebay_signing_key_created_at: string | null
          ebay_signing_key_id: string | null
          id: string | null
          invoice_prefix: string | null
          is_ebay_connected: boolean | null
          next_invoice_number: number | null
          seller_address: string | null
          seller_business_name: string | null
          seller_email: string | null
          seller_vat_number: string | null
          tax_year_start: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_active_subscription: {
        Args: { check_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      trigger_scheduled_sync: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
