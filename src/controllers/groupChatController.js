const { PrismaClient } = require('@prisma/client');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHandler');
const { validatePagination } = require('../utils/validation');

const prisma = new PrismaClient();

/**
 * @desc    Get or create group chat for a pool group
 * @route   GET /api/pooling/:groupId/chat
 * @access  Private
 */
exports.getOrCreateGroupChat = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { before, limit = 50 } = req.query;

    // Verify user is a member of the pool group (or admin)
    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId },
      include: {
        trip: {
          select: {
            destination: true
          }
        },
        members: {
          where: { userId: req.user.id }
        }
      }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    // Allow admins to access all chats, or if user is a member/creator
    const isAdmin = req.user.role === 'ADMIN';
    const isMember = poolGroup.members.length > 0 || poolGroup.createdById === req.user.id;
    
    if (!isAdmin && !isMember) {
      return sendError(res, 'You are not a member of this group', 403);
    }

    // Get or create chat
    let chat = await prisma.groupChat.findUnique({
      where: { poolGroupId: groupId }
    });

    if (!chat) {
      chat = await prisma.groupChat.create({
        data: { poolGroupId: groupId }
      });
    }

    // Fetch messages
    const where = { chatId: chat.id };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await prisma.groupMessage.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10)
    });

    // Reverse to get chronological order
    messages.reverse();

    sendSuccess(res, {
      chat,
      messages,
      poolGroup: {
        id: poolGroup.id,
        destination: poolGroup.trip?.destination
      }
    }, 'Chat retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get messages for a group chat (with pagination)
 * @route   GET /api/pooling/:groupId/chat/messages
 * @access  Private
 */
exports.getMessages = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { page, limit } = validatePagination(req.query.page, req.query.limit);
    const { before } = req.query;

    // Verify user is a member
    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId },
      include: {
        members: {
          where: { userId: req.user.id }
        }
      }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    // Allow admins to access all chats, or if user is a member/creator
    const isAdmin = req.user.role === 'ADMIN';
    const isMember = poolGroup.members.length > 0 || poolGroup.createdById === req.user.id;
    
    if (!isAdmin && !isMember) {
      return sendError(res, 'You are not a member of this group', 403);
    }

    const chat = await prisma.groupChat.findUnique({
      where: { poolGroupId: groupId }
    });

    if (!chat) {
      return sendSuccess(res, { messages: [], total: 0 }, 'No messages yet');
    }

    const where = { chatId: chat.id };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const [messages, total] = await Promise.all([
      prisma.groupMessage.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.groupMessage.count({ where })
    ]);

    // Reverse to get chronological order
    messages.reverse();

    sendPaginated(res, { messages }, { page, limit, total }, 'Messages retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send a message to group chat
 * @route   POST /api/pooling/:groupId/chat/messages
 * @access  Private
 */
exports.sendMessage = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return sendError(res, 'Message content is required', 400);
    }

    // Verify user is a member
    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId },
      include: {
        members: {
          where: { userId: req.user.id }
        }
      }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    // Allow admins to access all chats, or if user is a member/creator
    const isAdmin = req.user.role === 'ADMIN';
    const isMember = poolGroup.members.length > 0 || poolGroup.createdById === req.user.id;
    
    if (!isAdmin && !isMember) {
      return sendError(res, 'You are not a member of this group', 403);
    }

    // Get or create chat
    let chat = await prisma.groupChat.findUnique({
      where: { poolGroupId: groupId }
    });

    if (!chat) {
      chat = await prisma.groupChat.create({
        data: { poolGroupId: groupId }
      });
    }

    // Create message
    const message = await prisma.groupMessage.create({
      data: {
        chatId: chat.id,
        senderId: req.user.id,
        content: content.trim()
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Update chat updatedAt
    await prisma.groupChat.update({
      where: { id: chat.id },
      data: { updatedAt: new Date() }
    });

    sendSuccess(res, { message }, 'Message sent successfully', 201);
  } catch (error) {
    next(error);
  }
};

