import { useState, useEffect, useCallback } from 'react';
import {
  Typography, Button, Input, message, Table, Space, Tag, Modal, Popconfirm, ColorPicker,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TagsOutlined } from '@ant-design/icons';
import { tagApi } from '../services/api';
import { TagWithCount } from '../types';
import { sanitizeInput, stripTags } from '../utils/sanitize';

const { Title, Text } = Typography;

const presetColors = [
  '#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1',
  '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911',
];

export default function TagPage() {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTag, setEditingTag] = useState<TagWithCount | null>(null);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#1677ff');
  const [saving, setSaving] = useState(false);

  const loadTags = useCallback(async () => {
    try {
      const data = await tagApi.getAll();
      setTags(data);
    } catch {
      message.error('获取标签失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const openCreate = () => {
    setEditingTag(null);
    setTagName('');
    setTagColor('#1677ff');
    setShowModal(true);
  };

  const openEdit = (tag: TagWithCount) => {
    setEditingTag(tag);
    setTagName(tag.name);
    setTagColor(tag.color);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!tagName.trim()) {
      message.error('请输入标签名称');
      return;
    }
    setSaving(true);
    try {
      if (editingTag) {
        await tagApi.update(editingTag.id, { name: tagName.trim(), color: tagColor });
        message.success('标签已更新');
      } else {
        await tagApi.create(tagName.trim(), tagColor);
        message.success('标签已创建');
      }
      setShowModal(false);
      loadTags();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await tagApi.delete(id);
      message.success('标签已删除');
      loadTags();
    } catch {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: '标签',
      dataIndex: 'name',
      render: (name: string, record: TagWithCount) => (
        <Tag color={record.color} style={{ fontSize: 14, padding: '2px 12px' }}>
          {name}
        </Tag>
      ),
    },
    {
      title: '关联股票/基金',
      dataIndex: 'watchlistCount',
      width: 140,
      render: (count: number) => <Text>{count} 个</Text>,
    },
    {
      title: '关联投资',
      dataIndex: 'investmentCount',
      width: 120,
      render: (count: number) => <Text>{count} 条</Text>,
    },
    {
      title: '操作',
      width: 120,
      render: (_: any, record: TagWithCount) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title="删除此标签？关联的投资/股票不会被删除。"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <TagsOutlined /> 标签管理 ({tags.length})
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建标签
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={tags}
        rowKey="id"
        loading={loading}
        pagination={false}
        locale={{ emptyText: '暂无标签，点击上方按钮创建' }}
      />

      <Modal
        title={editingTag ? '编辑标签' : '新建标签'}
        open={showModal}
        onCancel={() => setShowModal(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>标签名称：</Text>
          <Input
            value={tagName}
            onChange={(e) => setTagName(stripTags(e.target.value))}
            placeholder="如：新能源、科技、长期持有"
            maxLength={20}
            style={{ marginTop: 8 }}
          />
        </div>
        <div>
          <Text strong>标签颜色：</Text>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {presetColors.map((c) => (
              <div
                key={c}
                onClick={() => setTagColor(c)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: c,
                  cursor: 'pointer',
                  border: tagColor === c ? '3px solid #000' : '2px solid #d9d9d9',
                }}
              />
            ))}
            <ColorPicker
              value={tagColor}
              onChange={(_, hex) => setTagColor(hex)}
              size="small"
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <Tag color={tagColor} style={{ fontSize: 14, padding: '2px 12px' }}>
              {tagName || '预览'}
            </Tag>
          </div>
        </div>
      </Modal>
    </div>
  );
}
